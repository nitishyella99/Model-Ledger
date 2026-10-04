import { PageHeading } from "@/components/models/page-heading";
import { UserProfile } from "@clerk/nextjs";

export default function ProfilePage() {
  return (
    <div className="space-y-6">
      <PageHeading
        eyebrow="Profile"
        title="Profile"
        description="Manage your account, sign-in methods, and active sessions."
      />
      <UserProfile routing="hash" />
    </div>
  );
}
