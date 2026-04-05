import CoreGraphics
import Foundation

let options: CGWindowListOption = [.optionOnScreenOnly, .excludeDesktopElements]
guard let infoList = CGWindowListCopyWindowInfo(options, kCGNullWindowID) as? [[String: Any]] else {
    print("[]")
    exit(0)
}

var result: [[String: Any]] = []
for info in infoList {
    guard let bounds = info[kCGWindowBounds as String] as? [String: Any],
          let layer = info[kCGWindowLayer as String] as? Int,
          layer == 0,
          let x = bounds["X"] as? Double,
          let y = bounds["Y"] as? Double,
          let w = bounds["Width"] as? Double,
          let h = bounds["Height"] as? Double,
          w > 100, h > 100 else { continue }

    let owner = info[kCGWindowOwnerName as String] as? String ?? ""
    let name = info[kCGWindowName as String] as? String ?? ""

    result.append(["x": round(x), "y": round(y), "w": round(w), "h": round(h), "owner": owner, "name": name])
}

if let data = try? JSONSerialization.data(withJSONObject: result),
   let json = String(data: data, encoding: .utf8) {
    print(json)
} else {
    print("[]")
}
