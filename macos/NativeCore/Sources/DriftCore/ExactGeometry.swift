import Foundation

public enum DriftCoreError: Error, LocalizedError, Equatable, Sendable {
    case invalid(String)
    case overflow
    public var errorDescription:String?{
        switch self{case .invalid(let message):return message;case .overflow:return "This value exceeds Drift's exact arithmetic limits."}
    }
}

func checkedAdd(_ a: Int64, _ b: Int64) throws -> Int64 {
    let (value, overflow) = a.addingReportingOverflow(b)
    guard !overflow else { throw DriftCoreError.overflow }
    return value
}

func checkedMultiply(_ a: Int64, _ b: Int64) throws -> Int64 {
    let (value, overflow) = a.multipliedReportingOverflow(by: b)
    guard !overflow else { throw DriftCoreError.overflow }
    return value
}

func gcd(_ a: Int64, _ b: Int64) -> Int64 {
    var a = a, b = b
    while b != 0 { let next = a % b; a = b; b = next }
    return a
}

/// Exact positive ratio. Decimal strings never pass through binary floating point.
public struct ExactRatio: Equatable, Hashable, Codable, Sendable {
    public let numerator: Int64
    public let denominator: Int64

    public init(_ numerator: Int64, _ denominator: Int64) throws {
        guard numerator > 0, denominator > 0 else {
            throw DriftCoreError.invalid("Ratio values must be positive.")
        }
        let factor = gcd(numerator, denominator)
        self.numerator = numerator / factor
        self.denominator = denominator / factor
    }

    public var value: Double { Double(numerator) / Double(denominator) }

    public init(pair: String) throws {
        let parts = pair.lowercased().components(separatedBy: CharacterSet(charactersIn: "x×:"))
        guard parts.count == 2 else {
            throw DriftCoreError.invalid("Enter a pair such as 2576 × 1080 or 25.76:10.80.")
        }
        let a = try Self.decimal(parts[0]), b = try Self.decimal(parts[1])
        let common = gcd(a.1, b.1)
        try self.init(checkedMultiply(a.0, b.1 / common), checkedMultiply(b.0, a.1 / common))
    }

    static func decimal(_ text: String) throws -> (Int64, Int64) {
        let text = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty, text.utf8.count <= 32,
              text.utf8.allSatisfy({ (48...57).contains($0) || $0 == 46 }) else {
            throw DriftCoreError.invalid("Use positive decimal numbers without exponents or grouping.")
        }
        let parts = text.split(separator: ".", omittingEmptySubsequences: false)
        guard (1...2).contains(parts.count), !parts[0].isEmpty,
              parts.count == 1 || (!parts[1].isEmpty && parts[1].count <= 9),
              let digits = Int64(parts.joined()), digits > 0 else {
            throw DriftCoreError.invalid("Each ratio value needs at most nine decimal places.")
        }
        let places = parts.count == 2 ? parts[1].count : 0
        var scale: Int64 = 1
        for _ in 0..<places { scale *= 10 }
        let factor = gcd(digits, scale)
        return (digits / factor, scale / factor)
    }

    private enum CodingKeys: String, CodingKey { case numerator, denominator }
    public init(from decoder: any Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        try self.init(c.decode(Int64.self, forKey: .numerator), c.decode(Int64.self, forKey: .denominator))
    }
}

/// Pixel dimensions and aspect-ratio authoring are deliberately different types.
public struct CanvasSize: Equatable, Codable, Sendable {
    public let width: Int
    public let height: Int
    public static let wideDeck = try! CanvasSize(width: 2576, height: 1080)

    public init(width: Int, height: Int) throws {
        guard (256...8192).contains(width), (256...8192).contains(height),
              width <= 33_177_600 / height else {
            throw DriftCoreError.invalid("Canvas dimensions must be 256–8192 pixels, within 33,177,600 pixels.")
        }
        self.width = width; self.height = height
    }

    public init(pair: String) throws {
        let parts = pair.lowercased().components(separatedBy: CharacterSet(charactersIn: "x×:"))
        guard parts.count == 2 else { throw DriftCoreError.invalid("Enter integer canvas width × height.") }
        let values = try parts.map { part -> Int in
            let text = part.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !text.isEmpty, text.utf8.allSatisfy({ (48...57).contains($0) }), let n = Int(text) else {
                throw DriftCoreError.invalid("Canvas dimensions are integer pixels, not decimal ratios.")
            }
            return n
        }
        try self.init(width: values[0], height: values[1])
    }

    public var ratio: ExactRatio { try! ExactRatio(Int64(width), Int64(height)) }
    public func validateH264() throws {
        guard width.isMultiple(of: 2), height.isMultiple(of: 2) else {
            throw DriftCoreError.invalid("H.264 requires even dimensions. Choose even pixels or PNG; the canvas was not resized.")
        }
    }

    private enum CodingKeys: String, CodingKey { case width, height }
    public init(from decoder: any Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        try self.init(width: c.decode(Int.self, forKey: .width), height: c.decode(Int.self, forKey: .height))
    }
}
