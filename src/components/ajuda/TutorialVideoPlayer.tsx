import { Play, Video } from "lucide-react";

interface TutorialVideoPlayerProps {
  videoUrl?: string;
  title: string;
}

export function TutorialVideoPlayer({ videoUrl, title }: TutorialVideoPlayerProps) {
  if (!videoUrl) {
    return null;
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
