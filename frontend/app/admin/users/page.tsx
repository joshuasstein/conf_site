"use client";

import { useEffect, useState } from "react";
import { admin, type User, type UserRole } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { Trash2, Users } from "lucide-react";

// "reviewer" is granted via the Reviewer checkbox, not as a primary role.
const ROLES: UserRole[] = ["submitter", "program_chair", "admin"];

const roleBadgeVariant = (role: string) => {
  switch (role) {
    case "admin": return "destructive" as const;
    case "program_chair": return "purple" as const;
    case "reviewer": return "info" as const;
    default: return "secondary" as const;
  }
};

export default function AdminUsersPage() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  useEffect(() => {
    admin
      .getUsers()
      .then(setUsers)
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : "Failed to load users";
        toast({ title: "Error", description: msg, variant: "destructive" });
      })
      .finally(() => setLoading(false));
  }, []);

  const handleRoleChange = async (userId: string, role: UserRole) => {
    setUpdating(userId);
    try {
      const updated = await admin.updateUser(userId, { role });
      setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, ...updated } : u)));
      toast({ title: "Updated", description: `Role changed to ${role}.` });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed";
      toast({ title: "Error", description: msg, variant: "destructive" });
    } finally {
      setUpdating(null);
    }
  };

  const handleReviewerToggle = async (userId: string, is_reviewer: boolean) => {
    setUpdating(userId);
    try {
      const updated = await admin.updateUser(userId, { is_reviewer });
      setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, ...updated } : u)));
      toast({ title: "Updated", description: is_reviewer ? "Reviewer privilege granted." : "Reviewer privilege removed." });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed";
      toast({ title: "Error", description: msg, variant: "destructive" });
    } finally {
      setUpdating(null);
    }
  };

  const handleDelete = async (userId: string, fullName: string) => {
    if (!confirm(`Permanently delete ${fullName}? This cannot be undone.`)) return;
    setDeleting(userId);
    try {
      await admin.deleteUser(userId);
      setUsers((prev) => prev.filter((u) => u.id !== userId));
      toast({ title: "Deleted", description: `${fullName} has been deleted.` });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed";
      toast({ title: "Error", description: msg, variant: "destructive" });
    } finally {
      setDeleting(null);
    }
  };

  if (currentUser?.role !== "admin") {
    return (
      <div className="text-center py-16 text-slate-500">
        <p>Only admins can manage users.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6 flex items-center gap-3">
        <Users className="h-6 w-6 text-indigo-600" />
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Users</h1>
          <p className="text-sm text-slate-500">{users.length} registered accounts</p>
        </div>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-14 rounded bg-slate-200 animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Username</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead className="text-center">Reviewer</TableHead>
                <TableHead>Joined</TableHead>
                <TableHead className="w-24">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((u) => (
                <TableRow key={u.id}>
                  <TableCell className="font-medium text-slate-900">{u.full_name}</TableCell>
                  <TableCell className="text-sm text-slate-500 font-mono">{u.username}</TableCell>
                  <TableCell className="text-sm text-slate-600">{u.email}</TableCell>
                  <TableCell>
                    {u.id === currentUser?.id ? (
                      <Badge variant={roleBadgeVariant(u.role)}>
                        {u.role.replace(/_/g, " ")}
                      </Badge>
                    ) : (
                      <Select
                        value={u.role}
                        onValueChange={(role) => handleRoleChange(u.id, role as UserRole)}
                        disabled={updating === u.id}
                      >
                        <SelectTrigger className="h-7 w-36 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {/* Legacy reviewer-role accounts: show their current role so
                              the dropdown isn't blank, but it can't be re-selected. */}
                          {!ROLES.includes(u.role) && (
                            <SelectItem value={u.role} disabled className="text-xs">
                              {u.role.replace(/_/g, " ")} (legacy)
                            </SelectItem>
                          )}
                          {ROLES.map((r) => (
                            <SelectItem key={r} value={r} className="text-xs">
                              {r.replace(/_/g, " ")}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </TableCell>
                  <TableCell className="text-center">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-slate-300 align-middle"
                      checked={u.is_reviewer}
                      disabled={updating === u.id}
                      onChange={(e) => handleReviewerToggle(u.id, e.target.checked)}
                      title="Grant reviewer privileges"
                    />
                  </TableCell>
                  <TableCell className="text-xs text-slate-400">
                    {format(new Date(u.created_at), "MMM d, yyyy")}
                  </TableCell>
                  <TableCell>
                    {u.id !== currentUser?.id && (
                      <Button
                        variant="ghost"
                        size="sm"
                        loading={deleting === u.id}
                        onClick={() => handleDelete(u.id, u.full_name)}
                        className="text-red-600 hover:text-red-700"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
