import { isolatedDemoEnabled } from "@/lib/demo-environment";
import Login from "@/components/login";
export const dynamic = "force-dynamic";
export default function Page() {
  return <Login demo={isolatedDemoEnabled()} />;
}
