import 'package:flutter_test/flutter_test.dart';
import '../lib/versioning.dart';

void main() {
  test('compares semantic versions and ignores build metadata', () {
    expect(compareVersions('1.2.10', '1.2.9'), greaterThan(0));
    expect(compareVersions('1.2', '1.2.0'), 0);
    expect(compareVersions('', '0.0.1'), lessThan(0));
    expect(compareVersions('1.2.0+44', '1.2.0+99'), 0);
    expect(compareVersions('1.2.0+44', '1.2.1'), lessThan(0));
  });
}
