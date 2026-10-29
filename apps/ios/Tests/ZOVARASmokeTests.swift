import XCTest
@testable import ZOVARA

final class ZOVARASmokeTests: XCTestCase {
    func testAppName() { XCTAssertEqual("ZO" + "VARA", "ZOVARA") }
}
