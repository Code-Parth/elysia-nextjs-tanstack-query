"use client";

import { queryClient } from "@/constants";
import { QueryClientProvider } from "@tanstack/react-query";

export function Provider({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}
