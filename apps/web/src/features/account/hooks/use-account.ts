'use client';

import type { AddressView, AuthUser, ProfileView } from '@zyventa/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { authKeys } from '@/features/auth/use-auth';
import { addressService, profileService } from '@/services/shopper.service';

export const accountKeys = {
  profile: ['account', 'profile'] as const,
  addresses: ['account', 'addresses'] as const,
};

export function useProfile() {
  return useQuery({ queryKey: accountKeys.profile, queryFn: profileService.get });
}

/** Keeps the header's cached user in sync after a profile change. */
function useProfileCache() {
  const queryClient = useQueryClient();
  return (profile: ProfileView) => {
    queryClient.setQueryData(accountKeys.profile, profile);
    const user: Partial<ProfileView> = { ...profile };
    Reflect.deleteProperty(user, 'notificationPreferences');
    queryClient.setQueryData(authKeys.me, user as AuthUser);
  };
}

export function useUpdateProfile() {
  const save = useProfileCache();
  return useMutation({ mutationFn: profileService.update, onSuccess: save });
}

export function useUpdatePreferences() {
  const save = useProfileCache();
  return useMutation({ mutationFn: profileService.updatePreferences, onSuccess: save });
}

export function useAddresses() {
  return useQuery({ queryKey: accountKeys.addresses, queryFn: addressService.list });
}

export function useAddressMutations() {
  const queryClient = useQueryClient();
  const setList = (list: AddressView[]) => {
    queryClient.setQueryData(accountKeys.addresses, list);
  };
  const refresh = () => queryClient.invalidateQueries({ queryKey: accountKeys.addresses });

  return {
    create: useMutation({ mutationFn: addressService.create, onSuccess: refresh }),
    update: useMutation({
      mutationFn: ({
        id,
        input,
      }: {
        id: string;
        input: Parameters<typeof addressService.update>[1];
      }) => addressService.update(id, input),
      onSuccess: refresh,
    }),
    setDefault: useMutation({ mutationFn: addressService.setDefault, onSuccess: setList }),
    remove: useMutation({ mutationFn: addressService.remove, onSuccess: setList }),
  };
}
