import type { User } from "@shared/models/auth";

// DEV MODE: Auth bypassed for development - always authenticated with demo user
const DEMO_USER: User = {
  id: "demo-user-001",
  email: "demo@shipflow.pk",
  firstName: "Demo",
  lastName: "User",
  profileImageUrl: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

export function useAuth() {
  // Auth bypassed - always return authenticated demo user
  return {
    user: DEMO_USER,
    isLoading: false,
    isAuthenticated: true,
    logout: () => {
      // No-op in dev mode
      console.log("Logout disabled in dev mode");
    },
    isLoggingOut: false,
  };
}
