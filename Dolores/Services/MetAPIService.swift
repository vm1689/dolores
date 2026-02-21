import Foundation

actor MetAPIService {
    private let baseURL = "https://collectionapi.metmuseum.org/public/collection/v1/objects"

    struct MetObject: Decodable {
        let objectID: Int
        let title: String
        let artistDisplayName: String
        let objectDate: String
        let medium: String
        let primaryImage: String
        let primaryImageSmall: String
    }

    func fetchArtwork(objectID: Int) async -> Artwork? {
        guard let url = URL(string: "\(baseURL)/\(objectID)") else { return nil }

        do {
            let (data, _) = try await URLSession.shared.data(from: url)
            let metObject = try JSONDecoder().decode(MetObject.self, from: data)

            // Find the matching beacon major for this object ID
            let beaconMajor = ArtworkCatalog.beaconToObjectID
                .first(where: { $0.value == objectID })?.key ?? 0
            let fallback = ArtworkCatalog.fallbackArtworks[objectID]

            return Artwork(
                id: metObject.objectID,
                title: metObject.title,
                artist: metObject.artistDisplayName,
                date: metObject.objectDate,
                medium: metObject.medium,
                description: fallback?.description ?? "",
                imageURL: URL(string: metObject.primaryImage),
                imageName: fallback?.imageName,
                audioFileName: fallback?.audioFileName ?? "",
                beaconMajor: beaconMajor
            )
        } catch {
            print("Met API fetch failed for \(objectID): \(error.localizedDescription)")
            return ArtworkCatalog.fallbackArtworks[objectID]
        }
    }
}
