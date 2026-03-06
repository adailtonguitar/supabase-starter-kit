import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "./useCompany";
import { useAuth } from "./useAuth";
import { toast } from "sonner";

export interface CustomerReview {
  id: string;
  clientName: string;
  rating: number;
  comment: string;
  ambienteName: string;
  photo?: string;
  createdAt: string;
}

export function useCustomerReviews() {
  const { companyId } = useCompany();
  const { user } = useAuth();
  const [reviews, setReviews] = useState<CustomerReview[]>([]);
  const [loading, setLoading] = useState(true);

  const mapRow = (row: any): CustomerReview => ({
    id: row.id,
    clientName: row.client_name,
    rating: row.rating,
    comment: row.comment,
    ambienteName: row.ambiente_name || "",
    photo: row.photo_url || undefined,
    createdAt: row.created_at,
  });

  useEffect(() => {
    if (!companyId || !user) { setLoading(false); return; }
    let cancelled = false;

    (async () => {
      const { data } = await supabase
        .from("customer_reviews")
        .select("*")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false });

      if (!cancelled && data) setReviews(data.map(mapRow));
      if (!cancelled) setLoading(false);
    })();

    return () => { cancelled = true; };
  }, [companyId, user]);

  const avgRating = useMemo(() => {
    if (reviews.length === 0) return 0;
    return reviews.reduce((s, r) => s + r.rating, 0) / reviews.length;
  }, [reviews]);

  const addReview = useCallback(async (review: Omit<CustomerReview, "id" | "createdAt">) => {
    if (!companyId || !user) return;

    // Upload photo if base64
    let photoUrl = "";
    if (review.photo && review.photo.startsWith("data:")) {
      const ext = "jpg";
      const fileName = `${companyId}/reviews/${crypto.randomUUID()}.${ext}`;
      const base64 = review.photo.split(",")[1];
      const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
      const { error: upErr } = await supabase.storage
        .from("furniture-photos")
        .upload(fileName, bytes, { contentType: "image/jpeg" });
      if (!upErr) {
        const { data: urlData } = supabase.storage.from("furniture-photos").getPublicUrl(fileName);
        photoUrl = urlData.publicUrl;
      }
    }

    const { data, error } = await supabase.from("customer_reviews").insert({
      company_id: companyId,
      client_name: review.clientName,
      rating: review.rating,
      comment: review.comment,
      ambiente_name: review.ambienteName,
      photo_url: photoUrl,
      created_by: user.id,
    }).select().single();

    if (error) {
      toast.error("Erro ao salvar avaliação");
      return;
    }
    if (data) setReviews(prev => [mapRow(data), ...prev]);
    toast.success("Avaliação adicionada!");
  }, [companyId, user]);

  return { reviews, loading, avgRating, addReview };
}
