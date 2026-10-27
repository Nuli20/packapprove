"use client";
import { useRef } from "react";
import { commandTransport } from "@/lib/command-request";
export function useSetupCommand() {
  const transport = useRef<ReturnType<typeof commandTransport> | null>(null);
  if (!transport.current) transport.current = commandTransport();
  return transport.current;
}
