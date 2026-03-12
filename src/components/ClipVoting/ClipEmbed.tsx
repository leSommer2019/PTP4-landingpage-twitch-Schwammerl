interface ClipEmbedProps {
  twitchClipId: string
}

export default function ClipEmbed({ twitchClipId }: ClipEmbedProps) {
  const parent =
    typeof window !== 'undefined' ? window.location.hostname : 'localhost'

  return (
    <div className="clip-embed">
      <iframe
        src={`https://clips.twitch.tv/embed?clip=${twitchClipId}&parent=${parent}`}
        allowFullScreen
        title="Twitch Clip"
        loading="lazy"
      />
    </div>
  )
}

