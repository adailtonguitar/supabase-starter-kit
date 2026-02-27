import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Search, Users, Mail } from "lucide-react";

interface CompanyUser {
  id: string;
  user_id: string;
  company_id: string;
  role: string;
  created_at: string;
  user_email?: string;
  company_name?: string;
}

export function AdminCompanyUsers() {
  const [users, setUsers] = useState<CompanyUser[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  const fetchUsers = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("company_users")
      .select("id, user_id, company_id, role, created_at")
      .order("created_at", { ascending: false })
      .limit(200);

    if (!data || data.length === 0) {
      setUsers([]);
      setLoading(false);
      return;
    }

    const companyIds = [...new Set(data.map((u) => u.company_id))];
    const { data: companies } = await supabase
      .from("companies")
      .select("id, name")
      .in("id", companyIds);

    const companyMap: Record<string, string> = {};
    (companies ?? []).forEach((c: any) => { companyMap[c.id] = c.name; });

    const enriched = data.map((u) => ({
      ...u,
      company_name: companyMap[u.company_id] || u.company_id.slice(0, 8),
      user_email: u.user_id.slice(0, 8) + "...",
    }));

    setUsers(enriched);
    setLoading(false);
  };

  useEffect(() => { fetchUsers(); }, []);

  const filtered = search.trim()
    ? users.filter((u) =>
        u.company_name?.toLowerCase().includes(search.toLowerCase()) ||
        u.role?.toLowerCase().includes(search.toLowerCase()) ||
        u.user_id.toLowerCase().includes(search.toLowerCase())
      )
    : users;

  const roleColor = (role: string) => {
    if (role === "owner") return "default";
    if (role === "admin") return "secondary";
    return "outline";
  };

  return (
    <Card>
      <CardHeader className="p-3 sm:p-6">
        <CardTitle className="flex flex-col sm:flex-row sm:items-center gap-2 sm:justify-between">
          <span className="text-base sm:text-lg flex items-center gap-2">
            <Users className="w-4 h-4" /> Usuários ({filtered.length})
          </span>
          <div className="flex gap-2">
            <Input
              placeholder="Buscar empresa, role ou ID..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full sm:w-64 text-sm"
            />
            <Button variant="outline" size="sm" onClick={fetchUsers}>
              <Search className="h-4 w-4" />
            </Button>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-3 sm:p-6 pt-0 sm:pt-0">
        {loading ? (
          <div className="flex justify-center py-8">
            <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">Nenhum usuário encontrado.</p>
        ) : (
          <>
            {/* Mobile */}
            <div className="space-y-3 sm:hidden">
              {filtered.map((u) => (
                <div key={u.id} className="border rounded-lg p-3 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <p className="font-medium text-sm truncate">{u.company_name}</p>
                    <Badge variant={roleColor(u.role)} className="ml-2 shrink-0 capitalize">{u.role}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <Mail className="w-3 h-3" /> {u.user_id}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Desde {new Date(u.created_at).toLocaleDateString("pt-BR")}
                  </p>
                </div>
              ))}
            </div>

            {/* Desktop */}
            <div className="hidden sm:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Empresa</TableHead>
                    <TableHead>User ID</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Desde</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((u) => (
                    <TableRow key={u.id}>
                      <TableCell className="font-medium text-sm">{u.company_name}</TableCell>
                      <TableCell className="text-xs text-muted-foreground font-mono">{u.user_id}</TableCell>
                      <TableCell>
                        <Badge variant={roleColor(u.role)} className="capitalize">{u.role}</Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {new Date(u.created_at).toLocaleDateString("pt-BR")}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
