import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

async function safeJson(res: Response) {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("Something went wrong. Please try again.");
  }
}

export interface AuthUser {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  role: string;
  merchantId: string | null;
  merchant: {
    id: string;
    name: string;
    status: string;
    onboardingStep: string;
  } | null;
  sidebarMode: string;
  sidebarPinnedPages: string[];
  allowedPages: string[] | null;
  sessionDisplayName: string | null;
}

export function useAuth() {
  const queryClient = useQueryClient();

  const { data: user, isLoading, error } = useQuery<AuthUser>({
    queryKey: ["/api/auth/me"],
    queryFn: async () => {
      const res = await fetch("/api/auth/me", { credentials: "include" });
      if (!res.ok) {
        if (res.status === 401) return null;
        const data = await safeJson(res).catch(() => ({}));
        if (data.suspended) throw new Error("SUSPENDED");
        throw new Error(data.message || "Auth check failed");
      }
      return safeJson(res);
    },
    retry: false,
    staleTime: 5 * 60 * 1000,
  });

  const isSuspended = error?.message === "SUSPENDED";

  const sendOtpMutation = useMutation({
    mutationFn: async (data: { email: string; password: string }) => {
      const res = await apiRequest("POST", "/api/auth/send-otp", data);
      return safeJson(res);
    },
  });

  const verifyOtpMutation = useMutation({
    mutationFn: async (data: { email: string; otp: string; displayName: string; rememberDevice?: boolean }) => {
      const res = await apiRequest("POST", "/api/auth/verify-otp", data);
      return safeJson(res);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
    },
  });

  const registerMutation = useMutation({
    mutationFn: async (data: { email: string; password: string; firstName: string; lastName?: string; merchantName: string }) => {
      const res = await apiRequest("POST", "/api/auth/register", data);
      return safeJson(res);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
    },
  });

  const logoutMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/auth/logout");
    },
    onSuccess: () => {
      queryClient.setQueryData(["/api/auth/me"], null);
      queryClient.invalidateQueries();
    },
  });

  return {
    user: user || null,
    isLoading,
    isAuthenticated: !!user,
    isSuspended,
    sendOtp: sendOtpMutation.mutateAsync,
    isSendingOtp: sendOtpMutation.isPending,
    verifyOtp: verifyOtpMutation.mutateAsync,
    isVerifyingOtp: verifyOtpMutation.isPending,
    register: registerMutation.mutateAsync,
    registerError: registerMutation.error,
    isRegistering: registerMutation.isPending,
    logout: logoutMutation.mutate,
    isLoggingOut: logoutMutation.isPending,
  };
}
