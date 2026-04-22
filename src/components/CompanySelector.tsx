import { useState } from "react";
import { Building2, ChevronDown, Check } from "lucide-react";
import { useTenant } from "@/providers/TenantProvider";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function CompanySelector({ className }: { className?: string }) {
  const { currentCompany, companies, switchCompany, isLoading } = useTenant();

  if (isLoading) {
    return (
      <Button variant="ghost" className={cn("w-full justify-start gap-2 h-12", className)} disabled>
        <div className="w-8 h-8 rounded bg-muted animate-pulse" />
        <div className="flex flex-col items-start gap-1">
          <div className="h-3 w-20 rounded bg-muted animate-pulse" />
          <div className="h-2 w-12 rounded bg-muted animate-pulse" />
        </div>
      </Button>
    );
  }

  if (companies.length === 0) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className={cn("w-full justify-between gap-2 h-auto py-2 group hover:bg-muted/50 transition-all", className)}>
          <div className="flex items-center gap-2 overflow-hidden">
            <div className="flex-shrink-0 w-8 h-8 rounded bg-primary/10 flex items-center justify-center text-primary group-hover:bg-primary/20 transition-colors">
              <Building2 className="w-4 h-4" />
            </div>
            <div className="flex flex-col items-start overflow-hidden">
              <span className="text-sm font-semibold truncate max-w-[120px] text-foreground">
                {currentCompany?.name || "Empresa"}
              </span>
              <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">
                Alterar Unidade
              </span>
            </div>
          </div>
          <ChevronDown className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-[240px] p-2 bg-popover border-border shadow-lg rounded-xl">
        <DropdownMenuLabel className="px-2 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Minhas Empresas
        </DropdownMenuLabel>
        <DropdownMenuSeparator className="my-1 bg-border/50" />
        <div className="max-h-[300px] overflow-y-auto space-y-1">
          {companies.map((company) => (
            <DropdownMenuItem
              key={company.id}
              onClick={() => switchCompany(company.id)}
              className={cn(
                "flex items-center justify-between gap-2 px-2 py-2 cursor-pointer rounded-lg transition-colors",
                company.id === currentCompany?.id 
                  ? "bg-primary/5 text-primary font-medium" 
                  : "hover:bg-muted focus:bg-muted"
              )}
            >
              <div className="flex items-center gap-2 overflow-hidden">
                <Building2 className={cn(
                  "w-4 h-4 flex-shrink-0",
                  company.id === currentCompany?.id ? "text-primary" : "text-muted-foreground"
                )} />
                <span className="truncate text-sm">{company.name}</span>
              </div>
              {company.id === currentCompany?.id && (
                <Check className="w-4 h-4 text-primary" />
              )}
            </DropdownMenuItem>
          ))}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
