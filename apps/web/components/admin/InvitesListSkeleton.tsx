import { CapturedSkeleton } from "@/components/loading-ui/CapturedSkeleton";
import bones from "@/components/loading-ui/bones/admin-invites.bones.json";

export default function InvitesListSkeleton() {
  return <CapturedSkeleton name="admin-invites" bones={bones} />;
}
