import { CapturedSkeleton } from "@/components/loading-ui/CapturedSkeleton";
import bones from "@/components/loading-ui/bones/admin-users.bones.json";

export default function UserListSkeleton() {
  return <CapturedSkeleton name="admin-users" bones={bones} />;
}
