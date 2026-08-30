from pathlib import Path

folder = Path(
    "apps/mobile/assets/service-logos"
)

expected = [
    # Video
    "netflix",
    "disney-plus",
    "max",
    "prime-video",
    "amazon-prime",
    "apple-tv-plus",
    "youtube-premium",
    "hulu",
    "paramount-plus",
    "peacock",
    "crunchyroll",

    # Music / audio
    "spotify",
    "apple-music",
    "amazon-music-unlimited",
    "tidal",
    "audible",

    # Gaming
    "xbox-game-pass",
    "playstation-plus",
    "ea-play",
    "ubisoft-plus",
    "geforce-now",

    # AI / software / cloud
    "chatgpt",
    "claude",
    "microsoft-365",
    "adobe-creative-cloud",
    "canva",
    "dropbox",
    "google-one",
    "icloud-plus",

    # Fitness / wellness
    "strava",
    "calm",
    "headspace"
]

print()
print("SERVICE LOGO STATUS")
print("=" * 50)

found = 0

for slug in expected:
    path = folder / f"{slug}.png"

    if path.exists():
        found += 1
        status = "✓"
    else:
        status = "·"

    print(
        f"{status} {slug}"
    )

print()
print(
    f"{found}/{len(expected)} image assets present"
)
print(
    "Missing assets automatically use initials."
)
