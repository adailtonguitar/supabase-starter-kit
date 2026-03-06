import { useState } from "react";
import { MessageSquare, X } from "lucide-react";

interface PDVItemNotesProps {
  open: boolean;
  itemName: string;
  currentNote: string;
  onSave: (note: string) => void;
  onClose: () => void;
}

export function PDVItemNotesDialog({ open, itemName, currentNote, onSave, onClose }: PDVItemNotesProps) {
  const [note, setNote] = useState(currentNote);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div onClick={e => e.stopPropagation()} className="bg-card rounded-2xl border border-border shadow-2xl w-full max-w-sm mx-4 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="text-base font-bold text-foreground flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-primary" /> Observação do Item
          </h2>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-muted">
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>
        <div className="p-5 space-y-3">
          <p className="text-sm text-muted-foreground truncate">{itemName}</p>
          <textarea
            data-no-barcode-capture="true"
            value={note}
            onChange={e => setNote(e.target.value)}
            onKeyDown={e => {
              e.stopPropagation();
              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); onSave(note); }
              if (e.key === "Escape") onClose();
            }}
            placeholder="Ex: Embalar separado, gravar nome..."
            autoFocus
            rows={3}
            className="w-full px-3 py-2.5 rounded-xl bg-muted border border-border text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 resize-none"
          />
          <div className="flex gap-2">
            <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-border text-sm font-medium text-foreground hover:bg-muted">Cancelar</button>
            <button onClick={() => onSave(note)} className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-bold">Salvar</button>
          </div>
        </div>
      </div>
    </div>
  );
}
