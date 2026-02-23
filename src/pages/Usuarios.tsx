import { useState, useCallback } from "react";
import { motion } from "framer-motion";
import { useAuth } from "@/hooks/useAuth";
import { InviteUserDialog } from "@/components/users/InviteUserDialog";
import { toast } from "sonner";
import { Users, Shield, Clock, PenLine, Plus, Trash2, Search, ArrowLeft, Eye } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useCompanyUsers, type CompanyUser } from "@/hooks/useCompanyUsers";
import { usePermissions } from "@/hooks/usePermissions";
import { useActionLogs, type ActionLog } from "@/hooks/useActionLogs";

type CompanyRole = "admin" | "gerente" | "supervisor" | "caixa";
const roleLabels: Record<CompanyRole, string> = { admin: "Administrador", gerente: "Gerente", supervisor: "Supervisor", caixa: "Caixa" };
const roleColors: Record<CompanyRole, string> = { admin: "bg-destructive/10 text-destructive", gerente: "bg-primary/10 text-primary", supervisor: "bg-amber-500/10 text-amber-500", caixa: "bg-muted text-muted-foreground" };
const moduleLabels: Record<string, string> = { pdv: "PDV", dashboard: "Dashboard", produtos: "Produtos", vendas: "Vendas", caixa: "Caixa", financeiro: "Financeiro", fiscal: "Fiscal", configuracoes: "Configurações", usuarios: "Usuários" };

export default function Usuarios() {
  const navigate = useNavigate();
  const { users, isLoading, updateRole, toggleActive, removeUser, updateUserName } = useCompanyUsers();
  const { user: currentUser } = useAuth();
  const { canEdit } = usePermissions();
  const { logs, isLoading: logsLoading } = useActionLogs();
  const [tab, setTab] = useState<"users" | "permissions" | "logs">("users");
  const [searchLogs, setSearchLogs] = useState("");
  const [showInvite, setShowInvite] = useState(false);
  const canManage = canEdit("usuarios");
  const filteredLogs = logs.filter((l) => !searchLogs || l.action.toLowerCase().includes(searchLogs.toLowerCase()) || l.module.toLowerCase().includes(searchLogs.toLowerCase()));

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <button onClick={() => navigate(-1)} className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors flex-shrink-0"><ArrowLeft className="w-5 h-5" /></button>
          <div className="min-w-0"><h1 className="text-xl sm:text-2xl font-bold text-foreground truncate">Controle de Usuários</h1><p className="text-xs sm:text-sm text-muted-foreground mt-0.5">Gerencie perfis, permissões e logs</p></div>
        </div>
        {canManage && <button onClick={() => setShowInvite(true)} className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-all"><Plus className="w-4 h-4" />Convidar Usuário</button>}
      </div>
      <div className="flex gap-1 bg-muted/50 rounded-xl p-1 w-fit">
        {[{ key: "users" as const, label: "Usuários", icon: Users }, { key: "permissions" as const, label: "Permissões", icon: Shield }, { key: "logs" as const, label: "Logs", icon: Clock }].map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${tab === t.key ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}><t.icon className="w-4 h-4" />{t.label}</button>
        ))}
      </div>
      {tab === "users" && <UsersTab users={users} isLoading={isLoading} canManage={canManage} currentUserId={currentUser?.id} updateRole={updateRole} toggleActive={toggleActive} removeUser={removeUser} updateUserName={updateUserName} />}
      {tab === "permissions" && <PermissionsTab />}
      {tab === "logs" && <LogsTab logs={filteredLogs} isLoading={logsLoading} search={searchLogs} onSearchChange={setSearchLogs} />}
      <InviteUserDialog open={showInvite} onOpenChange={setShowInvite} />
    </div>
  );
}

function UsersTab({ users, isLoading, canManage, currentUserId, updateRole, toggleActive, removeUser, updateUserName }: { users: CompanyUser[]; isLoading: boolean; canManage: boolean; currentUserId?: string; updateRole: any; toggleActive: any; removeUser: any; updateUserName: any }) {
  const [editingUser, setEditingUser] = useState<CompanyUser | null>(null);
  const [editForm, setEditForm] = useState({ full_name: "", role: "caixa" as CompanyRole, is_active: true });
  const startEdit = useCallback((u: CompanyUser) => { setEditingUser(u); setEditForm({ full_name: u.profile?.full_name || "", role: u.role, is_active: u.is_active }); }, []);
  const saveEdit = useCallback(async () => {
    if (!editingUser) return;
    const isSelf = editingUser.user_id === currentUserId;
    if (editForm.full_name.trim() !== (editingUser.profile?.full_name || "")) await updateUserName(editingUser.user_id, editForm.full_name.trim());
    if (!isSelf && editForm.role !== editingUser.role) await updateRole(editingUser.id, editForm.role);
    if (!isSelf && editForm.is_active !== editingUser.is_active) await toggleActive(editingUser.id, editingUser.is_active);
    setEditingUser(null);
  }, [editingUser, editForm, currentUserId, updateUserName, updateRole, toggleActive]);

  if (isLoading) return <div className="flex justify-center py-12"><div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>;
  if (users.length === 0) return <div className="text-center py-12 text-muted-foreground"><Users className="w-12 h-12 mx-auto mb-3 opacity-50" /><p>Nenhum usuário encontrado</p></div>;

  return (
    <div className="space-y-3">
      {users.map((u, i) => {
        const isEditing = editingUser?.id === u.id;
        const isSelf = u.user_id === currentUserId;
        return (
          <motion.div key={u.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }} className="bg-card rounded-xl border border-border overflow-hidden">
            <div className="p-4 flex items-center gap-4">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0"><span className="text-sm font-bold text-primary">{(u.profile?.full_name || u.profile?.email || "?")[0].toUpperCase()}</span></div>
              <div className="flex-1 min-w-0"><p className="text-sm font-semibold text-foreground truncate">{u.profile?.full_name || "Sem nome"}</p><p className="text-xs text-muted-foreground truncate">{u.profile?.email || u.user_id}</p></div>
              <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${roleColors[u.role]}`}>{roleLabels[u.role]}</span>
              <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${u.is_active ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"}`}>{u.is_active ? "Ativo" : "Inativo"}</span>
              {canManage && (
                <div className="flex items-center gap-2">
                  <button onClick={() => isEditing ? setEditingUser(null) : startEdit(u)} className="p-1.5 rounded-lg text-muted-foreground hover:bg-secondary transition-colors"><PenLine className="w-4 h-4" /></button>
                  <button onClick={() => { if (isSelf) { toast.error("Você não pode remover sua própria conta"); return; } if (confirm("Remover este usuário?")) removeUser(u.id); }} className={`p-1.5 rounded-lg transition-colors ${isSelf ? "opacity-50 cursor-not-allowed" : "text-destructive hover:bg-destructive/10"}`}><Trash2 className="w-4 h-4" /></button>
                </div>
              )}
            </div>
            {isEditing && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} className="border-t border-border bg-secondary/20 p-4 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div><label className="text-sm font-medium text-foreground mb-1 block">Nome</label><input value={editForm.full_name} onChange={(e) => setEditForm((prev) => ({ ...prev, full_name: e.target.value }))} className="w-full px-3 py-2 rounded-lg bg-background border border-border text-foreground text-sm" /></div>
                  <div><label className="text-sm font-medium text-foreground mb-1 block">Perfil</label><select value={editForm.role} onChange={(e) => setEditForm((prev) => ({ ...prev, role: e.target.value as CompanyRole }))} disabled={isSelf} className="w-full px-3 py-2 rounded-lg bg-background border border-border text-foreground text-sm"><option value="admin">Administrador</option><option value="gerente">Gerente</option><option value="supervisor">Supervisor</option><option value="caixa">Caixa</option></select></div>
                  <div><label className="text-sm font-medium text-foreground mb-1 block">Status</label><select value={editForm.is_active ? "ativo" : "inativo"} onChange={(e) => setEditForm((prev) => ({ ...prev, is_active: e.target.value === "ativo" }))} disabled={isSelf} className="w-full px-3 py-2 rounded-lg bg-background border border-border text-foreground text-sm"><option value="ativo">Ativo</option><option value="inativo">Inativo</option></select></div>
                </div>
                <div className="flex gap-2"><button onClick={saveEdit} className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium">Salvar</button><button onClick={() => setEditingUser(null)} className="px-4 py-2 rounded-lg bg-secondary text-secondary-foreground text-sm font-medium">Cancelar</button></div>
              </motion.div>
            )}
          </motion.div>
        );
      })}
    </div>
  );
}

function PermissionsTab() {
  const modules = Object.keys(moduleLabels);
  const roles: CompanyRole[] = ["admin", "gerente", "supervisor", "caixa"];
  const actions = [{ key: "can_view", icon: Eye, label: "Ver" }, { key: "can_create", icon: Plus, label: "Criar" }, { key: "can_edit", icon: PenLine, label: "Editar" }, { key: "can_delete", icon: Trash2, label: "Excluir" }];
  const permData: Record<string, Record<string, Record<string, boolean>>> = {
    admin: Object.fromEntries(modules.map((m) => [m, { can_view: true, can_create: true, can_edit: true, can_delete: true }])),
    gerente: { pdv: { can_view: true, can_create: true, can_edit: true, can_delete: false }, dashboard: { can_view: true, can_create: true, can_edit: true, can_delete: false }, produtos: { can_view: true, can_create: true, can_edit: true, can_delete: false }, vendas: { can_view: true, can_create: true, can_edit: false, can_delete: false }, caixa: { can_view: true, can_create: true, can_edit: true, can_delete: false }, financeiro: { can_view: true, can_create: true, can_edit: true, can_delete: false }, fiscal: { can_view: true, can_create: true, can_edit: false, can_delete: false }, configuracoes: { can_view: true, can_create: false, can_edit: false, can_delete: false }, usuarios: { can_view: true, can_create: true, can_edit: false, can_delete: false } },
    supervisor: { pdv: { can_view: true, can_create: true, can_edit: true, can_delete: false }, dashboard: { can_view: true, can_create: false, can_edit: false, can_delete: false }, produtos: { can_view: true, can_create: true, can_edit: true, can_delete: false }, vendas: { can_view: true, can_create: true, can_edit: false, can_delete: false }, caixa: { can_view: true, can_create: true, can_edit: true, can_delete: false }, financeiro: { can_view: true, can_create: false, can_edit: false, can_delete: false }, fiscal: { can_view: true, can_create: false, can_edit: false, can_delete: false }, configuracoes: { can_view: false, can_create: false, can_edit: false, can_delete: false }, usuarios: { can_view: false, can_create: false, can_edit: false, can_delete: false } },
    caixa: { pdv: { can_view: true, can_create: true, can_edit: false, can_delete: false }, dashboard: { can_view: false, can_create: false, can_edit: false, can_delete: false }, produtos: { can_view: true, can_create: false, can_edit: false, can_delete: false }, vendas: { can_view: true, can_create: false, can_edit: false, can_delete: false }, caixa: { can_view: true, can_create: true, can_edit: false, can_delete: false }, financeiro: { can_view: false, can_create: false, can_edit: false, can_delete: false }, fiscal: { can_view: false, can_create: false, can_edit: false, can_delete: false }, configuracoes: { can_view: false, can_create: false, can_edit: false, can_delete: false }, usuarios: { can_view: false, can_create: false, can_edit: false, can_delete: false } },
  };
  return (
    <div className="bg-card rounded-xl border border-border overflow-hidden"><div className="overflow-x-auto"><table className="w-full text-sm"><thead>
      <tr className="border-b border-border bg-muted/30"><th className="text-left p-3 font-medium text-muted-foreground">Módulo</th>{roles.map((r) => <th key={r} colSpan={4} className="text-center p-3 font-medium text-foreground"><span className={`text-xs px-2 py-0.5 rounded-full ${roleColors[r]}`}>{roleLabels[r]}</span></th>)}</tr>
      <tr className="border-b border-border bg-muted/10"><th />{roles.map((r) => actions.map((a) => <th key={`${r}-${a.key}`} className="p-2 text-center"><a.icon className="w-3.5 h-3.5 mx-auto text-muted-foreground" /></th>))}</tr>
    </thead><tbody>{modules.map((mod) => (
      <tr key={mod} className="border-b border-border last:border-0 hover:bg-muted/20"><td className="p-3 font-medium text-foreground">{moduleLabels[mod]}</td>
        {roles.map((r) => actions.map((a) => { const has = permData[r]?.[mod]?.[a.key] ?? false; return <td key={`${r}-${mod}-${a.key}`} className="p-2 text-center"><span className={`inline-block w-5 h-5 rounded-full text-xs leading-5 ${has ? "bg-emerald-500/20 text-emerald-500" : "bg-muted text-muted-foreground/40"}`}>{has ? "✓" : "—"}</span></td>; }))}
      </tr>
    ))}</tbody></table></div></div>
  );
}

function LogsTab({ logs, isLoading, search, onSearchChange }: { logs: ActionLog[]; isLoading: boolean; search: string; onSearchChange: (v: string) => void }) {
  if (isLoading) return <div className="flex justify-center py-12"><div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>;
  return (
    <div className="space-y-4">
      <div className="relative w-full max-w-sm"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" /><input type="text" value={search} onChange={(e) => onSearchChange(e.target.value)} placeholder="Buscar logs..." className="w-full pl-10 pr-4 py-2 rounded-xl bg-background border border-border text-sm text-foreground" /></div>
      {logs.length === 0 ? (<div className="text-center py-12 text-muted-foreground"><Clock className="w-12 h-12 mx-auto mb-3 opacity-50" /><p>Nenhum log de ação registrado</p></div>) : (
        <div className="space-y-2">{logs.map((log, i) => (
          <motion.div key={log.id} initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.02 }} className="bg-card rounded-xl border border-border p-3 flex items-start gap-3">
            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5"><Clock className="w-3.5 h-3.5 text-primary" /></div>
            <div className="flex-1 min-w-0"><div className="flex items-center gap-2 flex-wrap"><span className="text-sm font-medium text-foreground">{log.action}</span><span className="text-xs px-1.5 py-0.5 rounded bg-secondary text-secondary-foreground">{log.module}</span></div>{log.details && <p className="text-xs text-muted-foreground mt-0.5">{log.details}</p>}<div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground"><span>{log.user_name || "Usuário"}</span><span>{new Date(log.created_at).toLocaleString("pt-BR")}</span></div></div>
          </motion.div>
        ))}</div>
      )}
    </div>
  );
}
