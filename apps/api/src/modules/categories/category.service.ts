import {
  slugify,
  type Breadcrumb,
  type CategoryDetail,
  type CategoryInput,
  type CategoryNode,
  type CategoryUpdateInput,
} from '@zyventa/shared';
import type { Request } from 'express';
import type { ClientSession, Types } from 'mongoose';
import { mongoose } from '../../database/mongoose.js';
import { ApiError } from '../../utils/ApiError.js';
import type { JsonCache } from '../../utils/cache.js';
import { recordAudit } from '../audit/audit.service.js';
import { Product } from '../products/product.model.js';
import { seoOf, toImageView } from '../products/product.mapper.js';
import { Category, MAX_CATEGORY_DEPTH, type CategoryAttrs } from './category.model.js';

type CategoryLean = CategoryAttrs & { _id: Types.ObjectId };
interface AncestorRef {
  _id: Types.ObjectId;
  name: string;
  slug: string;
}

const TREE_KEY = 'categories:tree';
const detailKey = (slug: string) => `categories:slug:${slug}`;
const TTL = 300;

export function buildCategoryTree(categories: CategoryLean[]): CategoryNode[] {
  const nodes = new Map<string, CategoryNode>();
  for (const c of categories) {
    nodes.set(c._id.toString(), {
      id: c._id.toString(),
      name: c.name,
      slug: c.slug,
      icon: c.icon ?? null,
      image: toImageView(c.image, c.name),
      level: c.level,
      children: [],
    });
  }
  const roots: CategoryNode[] = [];
  for (const c of categories) {
    const node = nodes.get(c._id.toString());
    if (!node) continue;
    const parent = c.parent ? nodes.get(c.parent.toString()) : undefined;
    if (c.parent && !parent) continue; // parent inactive → hide the whole branch
    (parent ? parent.children : roots).push(node);
  }
  return roots;
}

export function breadcrumbsOf(c: Pick<CategoryLean, 'ancestors' | 'name' | 'slug'>): Breadcrumb[] {
  return [
    ...c.ancestors.map((a) => ({ name: a.name, slug: a.slug })),
    { name: c.name, slug: c.slug },
  ];
}

async function uniqueSlug(base: string, excludeId?: Types.ObjectId): Promise<string> {
  const root = slugify(base) || 'category';
  for (let n = 1; n < 100; n += 1) {
    const candidate = n === 1 ? root : `${root}-${String(n)}`;
    const clash = await Category.exists({
      slug: candidate,
      ...(excludeId ? { _id: { $ne: excludeId } } : {}),
    });
    if (!clash) return candidate;
  }
  throw ApiError.conflict('Could not generate a unique slug');
}

export function createCategoryService(cache: JsonCache) {
  async function invalidate(): Promise<void> {
    await cache.invalidatePrefix('categories:');
  }

  async function resolveParent(
    parentId: string | null,
    session?: ClientSession,
  ): Promise<{ ancestors: AncestorRef[]; level: number }> {
    if (!parentId) return { ancestors: [], level: 0 };
    const parent = await Category.findById(parentId)
      .session(session ?? null)
      .lean();
    if (!parent) throw ApiError.badRequest('Parent category not found');
    if (parent.level >= MAX_CATEGORY_DEPTH) {
      throw ApiError.badRequest(
        `Categories can be at most ${String(MAX_CATEGORY_DEPTH + 1)} levels deep`,
      );
    }
    return {
      ancestors: [
        ...parent.ancestors.map((a) => ({ _id: a._id, name: a.name, slug: a.slug })),
        { _id: parent._id, name: parent.name, slug: parent.slug },
      ],
      level: parent.level + 1,
    };
  }

  return {
    tree(): Promise<CategoryNode[]> {
      return cache.wrap(TREE_KEY, TTL, async () => {
        const categories = await Category.find({ isActive: true })
          .sort({ level: 1, sortOrder: 1, name: 1 })
          .lean();
        return buildCategoryTree(categories);
      });
    },

    async bySlug(slug: string): Promise<CategoryDetail> {
      const detail = await cache.wrap(detailKey(slug), TTL, async () => {
        const c = await Category.findOne({ slug, isActive: true }).lean();
        if (!c) return null;
        const children = await Category.find({ parent: c._id, isActive: true })
          .sort({ sortOrder: 1, name: 1 })
          .select('name slug')
          .lean();
        return {
          id: c._id.toString(),
          name: c.name,
          slug: c.slug,
          description: c.description,
          image: toImageView(c.image, c.name),
          breadcrumbs: breadcrumbsOf(c),
          children: children.map((ch) => ({ id: ch._id.toString(), name: ch.name, slug: ch.slug })),
          filterableAttributes: c.filterableAttributes.map((a) => ({
            key: a.key,
            label: a.label,
            values: a.values,
          })),
          seo: {
            title: seoOf(c.seo).title || c.name,
            description: seoOf(c.seo).description || c.description,
          },
        } satisfies CategoryDetail;
      });
      if (!detail) throw ApiError.notFound('Category not found');
      return detail;
    },

    /** Resolves an active category slug to its id (for listing filters). */
    async idForSlug(slug: string): Promise<Types.ObjectId> {
      const c = await Category.findOne({ slug, isActive: true }).select('_id').lean();
      if (!c) throw ApiError.notFound('Category not found');
      return c._id;
    },

    // ── Admin ────────────────────────────────────────────────────────────────

    async listAll(): Promise<(CategoryLean & { productCount: number })[]> {
      const [categories, counts] = await Promise.all([
        Category.find().sort({ level: 1, sortOrder: 1, name: 1 }).lean(),
        Product.aggregate<{ _id: Types.ObjectId; n: number }>([
          { $match: { status: { $ne: 'ARCHIVED' } } },
          { $group: { _id: '$category', n: { $sum: 1 } } },
        ]),
      ]);
      const byId = new Map(counts.map((c) => [c._id.toString(), c.n]));
      return categories.map((c) => ({ ...c, productCount: byId.get(c._id.toString()) ?? 0 }));
    },

    async create(req: Request, input: CategoryInput): Promise<CategoryLean> {
      const { ancestors, level } = await resolveParent(input.parentId);
      if (input.slug && (await Category.exists({ slug: input.slug }))) {
        throw ApiError.conflict('Slug already in use');
      }
      const slug = input.slug ?? (await uniqueSlug(input.name));
      const category = await Category.create({
        ...input,
        slug,
        parent: input.parentId,
        ancestors,
        level,
        image: input.image ?? null,
      });
      await recordAudit(req, {
        actorRole: 'ADMIN',
        action: 'category.created',
        resource: 'CATEGORY',
        resourceId: category._id.toString(),
        metadata: { name: category.name, slug, parent: input.parentId },
      });
      await invalidate();
      return category.toObject();
    },

    /**
     * Updates a category. Renames and moves are propagated in one transaction to every
     * descendant's denormalised `ancestors` and to affected products' `categoryPath`.
     */
    async update(req: Request, id: string, input: CategoryUpdateInput): Promise<CategoryLean> {
      const result = await mongoose.connection.transaction(async (session) => {
        const category = await Category.findById(id).session(session);
        if (!category) throw ApiError.notFound('Category not found');
        const before = {
          name: category.name,
          slug: category.slug,
          parent: category.parent?.toString() ?? null,
        };

        if (input.slug && input.slug !== category.slug) {
          if (
            await Category.exists({ slug: input.slug, _id: { $ne: category._id } }).session(session)
          ) {
            throw ApiError.conflict('Slug already in use');
          }
        }

        const moving = input.parentId !== undefined && (input.parentId ?? null) !== before.parent;
        const descendants = await Category.find({ 'ancestors._id': category._id }).session(session);

        if (moving) {
          if (
            input.parentId === category._id.toString() ||
            descendants.some((d) => d._id.toString() === input.parentId)
          ) {
            throw ApiError.badRequest('A category cannot be moved under itself or its descendants');
          }
          const { ancestors, level } = await resolveParent(input.parentId ?? null, session);
          const deepest = Math.max(0, ...descendants.map((d) => d.level - category.level));
          if (level + deepest > MAX_CATEGORY_DEPTH) {
            throw ApiError.badRequest('Moving here would exceed the maximum category depth');
          }
          category.set({ parent: input.parentId ?? null, ancestors, level });
        }

        const { parentId: _parentId, ...fields } = input;
        category.set(fields);
        await category.save({ session });

        const renamed = category.name !== before.name || category.slug !== before.slug;
        if (moving || renamed) {
          const self = { _id: category._id, name: category.name, slug: category.slug };
          for (const d of descendants) {
            const index = d.ancestors.findIndex((a) => a._id.equals(category._id));
            d.set({
              ancestors: [...category.ancestors, self, ...d.ancestors.slice(index + 1)],
              level: category.ancestors.length + 1 + (d.ancestors.length - index - 1),
            });
            await d.save({ session });
          }
        }
        if (moving) {
          for (const c of [category, ...descendants]) {
            await Product.updateMany(
              { category: c._id },
              { $set: { categoryPath: [...c.ancestors.map((a) => a._id), c._id] } },
              { session },
            );
          }
        }

        await recordAudit(
          req,
          {
            actorRole: 'ADMIN',
            action: moving ? 'category.moved' : 'category.updated',
            resource: 'CATEGORY',
            resourceId: category._id.toString(),
            metadata: { before, changes: input },
          },
          session,
        );
        return category.toObject();
      });
      await invalidate();
      return result;
    },

    /** Hard delete only when nothing depends on the category; otherwise deactivate it instead. */
    async remove(req: Request, id: string): Promise<void> {
      const category = await Category.findById(id).lean();
      if (!category) throw ApiError.notFound('Category not found');
      if (await Category.exists({ parent: category._id })) {
        throw ApiError.conflict('Remove or move its subcategories first');
      }
      if (await Product.exists({ category: category._id })) {
        throw ApiError.conflict('Products still use this category — deactivate it instead');
      }
      await Category.deleteOne({ _id: category._id });
      await recordAudit(req, {
        actorRole: 'ADMIN',
        action: 'category.deleted',
        resource: 'CATEGORY',
        resourceId: id,
        metadata: { name: category.name, slug: category.slug },
      });
      await invalidate();
    },
  };
}

export type CategoryService = ReturnType<typeof createCategoryService>;
