import { notFound } from "next/navigation";
import { isolatedDemoEnabled } from "@/lib/demo-environment";
import DemoEntry from "@/components/demo-entry";
export const dynamic = "force-dynamic";
export default function Demo() {
  if (!isolatedDemoEnabled()) notFound();
  return <DemoEntry />;
}
