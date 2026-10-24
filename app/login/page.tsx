import Login from "@/components/login";
export default function Page() {
  return <Login demo={process.env.NEXT_PUBLIC_DEMO_MODE === "true"} />;
}
