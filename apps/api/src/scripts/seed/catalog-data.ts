import type { GstRateBps, VariantOptionKey } from '@zyventa/shared';

/**
 * Development catalogue. All brands, sellers and products are fictional. GST defaults are
 * representative only — admins set the correct rate/HSN per category before going live.
 */

export type SellerKey = 'techverse' | 'loom' | 'hearth' | 'everyday';

export interface LeafTemplate {
  seller: SellerKey;
  brands: string[];
  /** Product names (one product each). */
  names: string[];
  /** Price range in rupees for the base variant. */
  price: [number, number];
  /** Variant axes; omitted = simple product with a single default variant. */
  axes?: Partial<Record<VariantOptionKey, string[]>>;
  /** Extra rupees added per value index on an axis (e.g. storage tiers). */
  axisPriceStep?: Partial<Record<VariantOptionKey, number>>;
  attributes?: Record<string, string[]>;
  specs?: [string, string][];
  gstRateBps?: GstRateBps;
  returnable?: boolean;
}

export interface CategoryNode {
  name: string;
  icon?: string;
  gstRateBps?: GstRateBps;
  filterable?: { key: string; label: string; values: string[] }[];
  children?: CategoryNode[];
  /** Present on leaf categories only. */
  products?: LeafTemplate;
}

export const BRANDS = [
  'Voltra',
  'Nimbus',
  'Orbitra',
  'Kestrix',
  'Lumora',
  'Urban Loom',
  'Saanjh',
  'Stridon',
  'Northpeak',
  'Kora',
  'Zenhaus',
  'Kitchora',
  'Pinecrest',
  'Brightleaf',
  'Glowveda',
  'Tarang',
  'Ironform',
  'Cycleworks',
  'Pageturn Press',
  'Munch Co.',
  'Little Sprout',
] as const;

const apparelSizes = ['S', 'M', 'L', 'XL'];

export const CATEGORY_TREE: CategoryNode[] = [
  {
    name: 'Electronics',
    icon: 'smartphone',
    gstRateBps: 1800,
    children: [
      {
        name: 'Smartphones',
        filterable: [{ key: 'network', label: 'Network', values: ['4G', '5G'] }],
        products: {
          seller: 'techverse',
          brands: ['Voltra', 'Nimbus', 'Orbitra'],
          names: [
            'Voltra X5 5G',
            'Nimbus Air 12',
            'Orbitra Pro Max',
            'Voltra Lite 4',
            'Nimbus Neo 5G',
          ],
          price: [11_999, 64_999],
          axes: { storage: ['128 GB', '256 GB'], color: ['Midnight Black', 'Glacier Blue'] },
          axisPriceStep: { storage: 4_000 },
          attributes: { network: ['5G', '4G'] },
          specs: [
            ['Display', '6.7" AMOLED, 120 Hz'],
            ['Battery', '5000 mAh'],
            ['Charging', '45 W wired'],
          ],
        },
      },
      {
        name: 'Laptops',
        filterable: [
          {
            key: 'processor',
            label: 'Processor',
            values: ['Core i5', 'Core i7', 'Ryzen 5', 'Ryzen 7'],
          },
        ],
        products: {
          seller: 'techverse',
          brands: ['Orbitra', 'Kestrix'],
          names: ['Kestrix Book 14', 'Orbitra Slim 15', 'Kestrix Creator 16', 'Orbitra Gamer G7'],
          price: [42_990, 1_24_990],
          axes: { ram: ['8 GB', '16 GB'], storage: ['512 GB SSD', '1 TB SSD'] },
          axisPriceStep: { ram: 6_000, storage: 5_000 },
          attributes: { processor: ['Core i5', 'Ryzen 7', 'Core i7', 'Ryzen 5'] },
          specs: [
            ['Display', '14–16" IPS'],
            ['Weight', '1.4 kg'],
            ['Warranty', '1 year onsite'],
          ],
        },
      },
      {
        name: 'Headphones & Earbuds',
        filterable: [{ key: 'type', label: 'Type', values: ['In-ear', 'Over-ear'] }],
        products: {
          seller: 'techverse',
          brands: ['Tarang', 'Nimbus'],
          names: [
            'Tarang Pods 3',
            'Tarang Bass 700',
            'Nimbus Buds ANC',
            'Tarang Studio Over-Ear',
            'Nimbus Sport Neckband',
          ],
          price: [1_299, 14_999],
          axes: { color: ['Black', 'White', 'Teal'] },
          attributes: { type: ['In-ear', 'Over-ear', 'In-ear', 'Over-ear', 'In-ear'] },
          specs: [
            ['Playback', 'Up to 40 hours'],
            ['Bluetooth', '5.3'],
          ],
        },
      },
      {
        name: 'Smartwatches',
        products: {
          seller: 'techverse',
          brands: ['Voltra', 'Lumora'],
          names: ['Voltra Fit Watch 2', 'Lumora Pulse', 'Lumora Pulse Pro', 'Voltra Active'],
          price: [2_499, 19_999],
          axes: { size: ['42 mm', '46 mm'], color: ['Graphite', 'Rose Gold'] },
          axisPriceStep: { size: 1_000 },
          specs: [
            ['Display', '1.43" AMOLED'],
            ['Water resistance', '5 ATM'],
          ],
        },
      },
      {
        name: 'Televisions',
        filterable: [{ key: 'resolution', label: 'Resolution', values: ['Full HD', '4K UHD'] }],
        products: {
          seller: 'techverse',
          brands: ['Lumora', 'Orbitra'],
          names: ['Lumora Vision 4K', 'Orbitra SmartView', 'Lumora QLED Cinema'],
          price: [18_999, 89_999],
          axes: { size: ['43 inch', '55 inch'] },
          axisPriceStep: { size: 14_000 },
          attributes: { resolution: ['4K UHD', 'Full HD', '4K UHD'] },
          specs: [
            ['Refresh rate', '60 Hz'],
            ['Smart OS', 'Built-in apps'],
          ],
          gstRateBps: 1800,
        },
      },
    ],
  },
  {
    name: 'Fashion',
    icon: 'shirt',
    gstRateBps: 500,
    children: [
      {
        name: "Men's Clothing",
        children: [
          {
            name: 'T-Shirts',
            filterable: [{ key: 'fit', label: 'Fit', values: ['Regular', 'Slim', 'Oversized'] }],
            products: {
              seller: 'loom',
              brands: ['Urban Loom', 'Northpeak'],
              names: [
                'Urban Loom Essential Crew Tee',
                'Northpeak Trail Graphic Tee',
                'Urban Loom Oversized Tee',
                'Northpeak Dry-Fit Tee',
                'Urban Loom Henley',
              ],
              price: [399, 1_299],
              axes: { size: apparelSizes, color: ['Navy', 'Olive'] },
              attributes: { fit: ['Regular', 'Slim', 'Oversized', 'Slim', 'Regular'] },
              specs: [
                ['Fabric', '100% cotton'],
                ['Care', 'Machine wash'],
              ],
            },
          },
          {
            name: 'Shirts',
            products: {
              seller: 'loom',
              brands: ['Urban Loom', 'Saanjh'],
              names: [
                'Urban Loom Oxford Shirt',
                'Saanjh Linen Kurta Shirt',
                'Urban Loom Denim Shirt',
                'Saanjh Mandarin Collar Shirt',
              ],
              price: [899, 2_499],
              axes: { size: apparelSizes, color: ['White', 'Sky Blue'] },
              specs: [['Fabric', 'Cotton blend']],
            },
          },
          {
            name: 'Jeans',
            products: {
              seller: 'loom',
              brands: ['Urban Loom', 'Northpeak'],
              names: [
                'Urban Loom Slim Jeans',
                'Northpeak Straight Fit Jeans',
                'Urban Loom Tapered Jeans',
              ],
              price: [1_199, 2_999],
              axes: { size: ['30', '32', '34', '36'], color: ['Indigo', 'Charcoal'] },
              specs: [['Stretch', '2% elastane']],
            },
          },
        ],
      },
      {
        name: "Women's Clothing",
        products: {
          seller: 'loom',
          brands: ['Saanjh', 'Kora'],
          names: [
            'Saanjh Block Print Kurta',
            'Kora Wrap Dress',
            'Saanjh Palazzo Set',
            'Kora Ribbed Top',
            'Kora Linen Co-ord',
          ],
          price: [699, 3_499],
          axes: { size: ['XS', 'S', 'M', 'L'], color: ['Terracotta', 'Sage'] },
          specs: [['Fabric', 'Rayon / cotton']],
        },
      },
      {
        name: 'Footwear',
        products: {
          seller: 'loom',
          brands: ['Stridon', 'Northpeak'],
          names: [
            'Stridon Cloudrun',
            'Stridon Court Classic',
            'Northpeak Trek Mid',
            'Stridon Slip-on Knit',
          ],
          price: [1_499, 6_999],
          axes: { size: ['UK 6', 'UK 7', 'UK 8', 'UK 9', 'UK 10'] },
          specs: [['Sole', 'EVA foam']],
        },
      },
      {
        name: 'Bags & Luggage',
        gstRateBps: 1800,
        products: {
          seller: 'loom',
          brands: ['Northpeak', 'Kora'],
          names: [
            'Northpeak Commuter Backpack 25L',
            'Kora Everyday Tote',
            'Northpeak Cabin Trolley',
          ],
          price: [999, 7_999],
          axes: { color: ['Black', 'Tan'] },
          specs: [['Material', 'Water-resistant polyester']],
        },
      },
    ],
  },
  {
    name: 'Home & Kitchen',
    icon: 'sofa',
    gstRateBps: 1800,
    children: [
      {
        name: 'Cookware',
        products: {
          seller: 'hearth',
          brands: ['Kitchora'],
          names: [
            'Kitchora Tri-ply Kadai 24 cm',
            'Kitchora Non-stick Tawa',
            'Kitchora Pressure Cooker 5 L',
            'Kitchora Cast Iron Skillet',
          ],
          price: [799, 3_999],
          specs: [['Induction compatible', 'Yes']],
        },
      },
      {
        name: 'Kitchen Appliances',
        products: {
          seller: 'hearth',
          brands: ['Kitchora', 'Zenhaus'],
          names: [
            'Kitchora Mixer Grinder 750 W',
            'Zenhaus Air Fryer 4.5 L',
            'Kitchora Electric Kettle 1.5 L',
            'Zenhaus Hand Blender',
          ],
          price: [1_199, 8_999],
          specs: [['Warranty', '2 years']],
        },
      },
      {
        name: 'Furniture',
        products: {
          seller: 'hearth',
          brands: ['Pinecrest', 'Zenhaus'],
          names: ['Pinecrest Study Desk', 'Zenhaus Ergo Chair', 'Pinecrest 3-Tier Bookshelf'],
          price: [3_499, 14_999],
          axes: { material: ['Engineered wood', 'Solid sheesham'] },
          axisPriceStep: { material: 4_000 },
          returnable: false,
        },
      },
      {
        name: 'Bedding',
        gstRateBps: 500,
        products: {
          seller: 'hearth',
          brands: ['Zenhaus', 'Brightleaf'],
          names: [
            'Zenhaus Cotton Bedsheet Set',
            'Brightleaf Microfibre Comforter',
            'Zenhaus Memory Foam Pillow',
          ],
          price: [699, 3_999],
          axes: { size: ['Single', 'Double', 'King'] },
          axisPriceStep: { size: 400 },
        },
      },
    ],
  },
  {
    name: 'Beauty & Personal Care',
    icon: 'sparkles',
    gstRateBps: 1800,
    children: [
      {
        name: 'Skincare',
        products: {
          seller: 'loom',
          brands: ['Glowveda'],
          names: [
            'Glowveda Vitamin C Serum',
            'Glowveda Gel Moisturiser',
            'Glowveda SPF 50 Sunscreen',
            'Glowveda Gentle Face Wash',
          ],
          price: [299, 1_199],
          returnable: false,
        },
      },
      {
        name: 'Haircare',
        products: {
          seller: 'loom',
          brands: ['Glowveda'],
          names: [
            'Glowveda Onion Hair Oil',
            'Glowveda Keratin Shampoo',
            'Glowveda Argan Conditioner',
          ],
          price: [249, 899],
          returnable: false,
        },
      },
    ],
  },
  {
    name: 'Sports & Fitness',
    icon: 'dumbbell',
    gstRateBps: 500,
    children: [
      {
        name: 'Fitness Equipment',
        products: {
          seller: 'hearth',
          brands: ['Ironform'],
          names: [
            'Ironform Adjustable Dumbbells',
            'Ironform Yoga Mat 6 mm',
            'Ironform Resistance Band Set',
            'Ironform Kettlebell 12 kg',
          ],
          price: [499, 9_999],
        },
      },
      {
        name: 'Cycling',
        gstRateBps: 500,
        products: {
          seller: 'hearth',
          brands: ['Cycleworks'],
          names: ['Cycleworks Urban 21-Speed', 'Cycleworks Kids 20"', 'Cycleworks Trail MTB'],
          price: [6_999, 24_999],
          axes: { size: ['S', 'M', 'L'] },
          returnable: false,
        },
      },
    ],
  },
  {
    name: 'Books',
    icon: 'book-open',
    gstRateBps: 0,
    children: [
      {
        name: 'Fiction',
        products: {
          seller: 'everyday',
          brands: ['Pageturn Press'],
          names: [
            'The Monsoon Archive',
            'Salt and Signal',
            'A City of Small Lights',
            'The Last Ferry to Kochi',
          ],
          price: [249, 599],
        },
      },
      {
        name: 'Non-fiction',
        products: {
          seller: 'everyday',
          brands: ['Pageturn Press'],
          names: ['Build Systems That Last', 'The Frugal Founder', 'Mind the Metrics'],
          price: [349, 899],
        },
      },
    ],
  },
  {
    name: 'Grocery',
    icon: 'shopping-basket',
    gstRateBps: 500,
    children: [
      {
        name: 'Snacks',
        products: {
          seller: 'everyday',
          brands: ['Munch Co.'],
          names: ['Munch Co. Roasted Makhana', 'Munch Co. Millet Chips', 'Munch Co. Trail Mix'],
          price: [99, 449],
          returnable: false,
        },
      },
      {
        name: 'Beverages',
        products: {
          seller: 'everyday',
          brands: ['Munch Co.', 'Brightleaf'],
          names: [
            'Brightleaf Assam Tea 500 g',
            'Munch Co. Cold Brew Coffee',
            'Brightleaf Green Tea 100 bags',
          ],
          price: [149, 699],
          returnable: false,
        },
      },
    ],
  },
  {
    name: 'Toys & Baby',
    icon: 'baby',
    gstRateBps: 500,
    children: [
      {
        name: 'Toys',
        products: {
          seller: 'everyday',
          brands: ['Little Sprout'],
          names: [
            'Little Sprout Wooden Blocks',
            'Little Sprout STEM Robot Kit',
            'Little Sprout Puzzle 100 pc',
          ],
          price: [399, 2_999],
        },
      },
      {
        name: 'Baby Care',
        products: {
          seller: 'everyday',
          brands: ['Little Sprout'],
          names: ['Little Sprout Baby Lotion', 'Little Sprout Soft Wipes (Pack of 6)'],
          price: [199, 699],
          returnable: false,
        },
      },
    ],
  },
];
