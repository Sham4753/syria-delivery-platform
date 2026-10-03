int compareVersions(String left, String right) {
  List<int> parse(String value) {
    final core = value.trim().split('+').first;
    if (core.isEmpty) return [0];
    return core.split('.').map((part) => int.tryParse(part) ?? 0).toList();
  }

  final a = parse(left);
  final b = parse(right);
  final length = a.length > b.length ? a.length : b.length;
  for (var i = 0; i < length; i++) {
    final ai = i < a.length ? a[i] : 0;
    final bi = i < b.length ? b[i] : 0;
    if (ai != bi) return ai < bi ? -1 : 1;
  }
  return 0;
}
