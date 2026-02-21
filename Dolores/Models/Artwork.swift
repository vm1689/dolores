import Foundation

struct Artwork: Identifiable, Hashable {
    let id: Int // Met Object ID
    let title: String
    let artist: String
    let date: String
    let medium: String
    let description: String
    let imageURL: URL?
    let imageName: String? // Bundled image filename (without extension)
    let audioFileName: String
    let beaconMajor: Int

    static func == (lhs: Artwork, rhs: Artwork) -> Bool {
        lhs.id == rhs.id
    }

    func hash(into hasher: inout Hasher) {
        hasher.combine(id)
    }
}

// MARK: - Beacon → Artwork Mapping

enum ArtworkCatalog {
    static let beaconUUID = "E2C56DB5-DFFB-48D2-B060-D0F5A71096E0"

    static let beaconToObjectID: [Int: Int] = [
        1: 45434,     // The Great Wave off Kanagawa (custom major)
        2: 436535,    // Wheat Field with Cypresses (custom major)
        3838: 45434   // Default Blue Charm major → Great Wave (fallback)
    ]

    static let allBeaconMajors: [Int] = [1, 2, 3838]

    // Hardcoded fallback data in case Met API is unavailable
    static let fallbackArtworks: [Int: Artwork] = [
        45434: Artwork(
            id: 45434,
            title: "The Great Wave off Kanagawa",
            artist: "Katsushika Hokusai",
            date: "ca. 1830–32",
            medium: "Polychrome woodblock print; ink and color on paper",
            description: """
            Under a towering wave, three boats full of fishermen struggle against the churning sea. \
            In the distance, Mount Fuji sits calmly beneath the chaos — small, still, eternal. This \
            is Hokusai's most famous print from the series "Thirty-six Views of Mount Fuji," created \
            when the artist was around seventy years old. The Great Wave captures the raw power of \
            nature set against human vulnerability. Hokusai used Prussian blue, a pigment recently \
            imported from Europe, to achieve the vivid blues that define this image. The composition \
            draws from both Japanese printmaking traditions and Western perspective techniques. It has \
            become one of the most recognized works of art in the world, influencing Impressionists \
            like Monet and Debussy's orchestral piece "La Mer."
            """,
            imageURL: URL(string: "https://images.metmuseum.org/CRDImages/as/web-large/DP130155.jpg"),
            imageName: "great_wave",
            audioFileName: "great_wave",
            beaconMajor: 1
        ),
        436535: Artwork(
            id: 436535,
            title: "Wheat Field with Cypresses",
            artist: "Vincent van Gogh",
            date: "1889",
            medium: "Oil on canvas",
            description: """
            Swirling clouds roll above a golden wheat field, while dark cypress trees rise like flames \
            against the sky. Van Gogh painted this during his stay at the Saint-Paul-de-Mausole asylum \
            in Saint-Rémy-de-Provence, just months after his famous breakdown. He called the cypresses \
            "beautiful as regards lines and proportions, like an Egyptian obelisk." The painting \
            vibrates with thick, rhythmic brushstrokes — the wheat ripples, the sky pulses, and the \
            cypresses twist upward with an almost living energy. Van Gogh made several versions of \
            this composition, considering it among his best summer landscapes. The Met's version is \
            the final one, completed in his studio. Despite his inner turmoil, there is a profound \
            serenity here — nature rendered not as it looks, but as it feels.
            """,
            imageURL: URL(string: "https://images.metmuseum.org/CRDImages/ep/web-large/DP-42549-001.jpg"),
            imageName: "wheat_field",
            audioFileName: "wheat_field",
            beaconMajor: 2
        )
    ]

    static func artwork(forBeaconMajor major: Int) -> Artwork? {
        guard let objectID = beaconToObjectID[major] else { return nil }
        return fallbackArtworks[objectID]
    }

    static func artwork(forObjectID id: Int) -> Artwork? {
        return fallbackArtworks[id]
    }
}
