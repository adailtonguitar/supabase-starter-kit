import { Play, Video } from "lucide-react";

interface TutorialVideoPlayerProps {
  videoUrl?: string;
  title: string;
}

export function TutorialVideoPlayer({ videoUrl, title }: TutorialVideoPlayerProps) {
  if (!videoUrl) {
    return (
      <div className="rounded-xl bg-muted/40 border border-dashed border-border flex flex-col items-center justify-center py-8 gap-2">
        <Video className="w-8 h-8 text-muted-foreground/50" />
        <p className="text-xs text-muted-foreground">Vídeo tutorial em breve</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl overflow-hidden border border-border aspect-video">
      <iframe
        src={videoUrl}
        title={`Tutorial: ${title}`}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
        className="w-full h-full"
        loading="lazy"
      />
    </div>
  );
}
