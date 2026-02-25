import { QueryClient, QueryFunction } from "@tanstack/react-query";

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  const res = await fetch(url, {
    method,
    headers: data ? { "Content-Type": "application/json" } : {},
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const res = await fetch(queryKey.join("/") as string, {
      credentials: "include",
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: true,
      staleTime: 30 * 1000,
      gcTime: 5 * 60 * 1000,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});

export function refreshAllData() {
  queryClient.invalidateQueries();
}

export async function syncAndRefreshAllData(): Promise<{ orders?: any; products?: any; errors: string[] }> {
  const errors: string[] = [];
  let ordersResult: any;
  let productsResult: any;

  try {
    const orderRes = await fetch("/api/integrations/shopify/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ forceFullSync: false }),
    });
    if (orderRes.ok) {
      ordersResult = await orderRes.json();
    } else {
      const text = await orderRes.text();
      errors.push(`Order sync: ${text}`);
    }
  } catch (e: any) {
    errors.push(`Order sync: ${e.message}`);
  }

  try {
    const prodRes = await fetch("/api/products/sync", {
      method: "POST",
      credentials: "include",
    });
    if (prodRes.ok) {
      productsResult = await prodRes.json();
    } else {
      const text = await prodRes.text();
      errors.push(`Product sync: ${text}`);
    }
  } catch (e: any) {
    errors.push(`Product sync: ${e.message}`);
  }

  queryClient.invalidateQueries();

  return { orders: ordersResult, products: productsResult, errors };
}
