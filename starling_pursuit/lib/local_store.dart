import 'dart:io';

import 'package:path_provider/path_provider.dart';

import 'models.dart';

class LocalStore {
  Future<AppData> load() async {
    final file = await _file();
    if (!await file.exists()) {
      final seeded = _seedData();
      await save(seeded);
      return seeded;
    }

    final raw = await file.readAsString();
    if (raw.trim().isEmpty) {
      final seeded = _seedData();
      await save(seeded);
      return seeded;
    }

    try {
      final parsed = AppData.fromEncodedJson(raw);
      final sanitized = _sanitizeSettings(parsed);
      if (!identical(sanitized, parsed)) {
        await save(sanitized);
      }
      return sanitized;
    } catch (_) {
      final seeded = _seedData();
      await save(seeded);
      return seeded;
    }
  }

  Future<void> save(AppData data) async {
    final file = await _file();
    await file.writeAsString(data.toEncodedJson());
  }

  Future<File> _file() async {
    final dir = await getApplicationDocumentsDirectory();
    return File('${dir.path}/starling_pursuit_data.json');
  }

  AppData _sanitizeSettings(AppData data) {
    final filteredCounts = data.settings.starlingQuickCounts
        .where((count) => count != 1000)
        .toList();
    if (filteredCounts.length == data.settings.starlingQuickCounts.length) {
      return data;
    }

    final sanitizedSettings = AdminSettings(
      feedSuggestionMinG: data.settings.feedSuggestionMinG,
      feedSuggestionMaxG: data.settings.feedSuggestionMaxG,
      rewardSmallG: data.settings.rewardSmallG,
      rewardMediumG: data.settings.rewardMediumG,
      rewardLargeG: data.settings.rewardLargeG,
      rewardPickUpPieceG: data.settings.rewardPickUpPieceG,
      starlingQuickCounts: filteredCounts,
    );
    return data.copyWith(settings: sanitizedSettings);
  }

  AppData _seedData() {
    return AppData(
      handlers: [
        HandlerUser(
          id: 'u1',
          name: 'Alex Handler',
          pin: '1111',
          role: UserRole.handler,
        ),
        HandlerUser(
          id: 'u2',
          name: 'Morgan Handler',
          pin: '2222',
          role: UserRole.handler,
        ),
        HandlerUser(
          id: 'u3',
          name: 'Taylor Manager',
          pin: '9999',
          role: UserRole.manager,
        ),
      ],
      falcons: [
        FalconProfile(id: 'f1', name: 'Astra', tag: 'AST-01'),
        FalconProfile(id: 'f2', name: 'Kest', tag: 'KES-02'),
        FalconProfile(id: 'f3', name: 'Nova', tag: 'NOV-03'),
      ],
      fields: [
        FieldBoundary(
          id: 'field_1',
          name: 'Blueberry South Block',
          perimeterMeters: 30,
          polygon: [
            GeoPoint(lat: 47.661300, lng: -122.317900),
            GeoPoint(lat: 47.661300, lng: -122.312900),
            GeoPoint(lat: 47.658700, lng: -122.312900),
            GeoPoint(lat: 47.658700, lng: -122.317900),
          ],
        ),
        FieldBoundary(
          id: 'field_2',
          name: 'Blueberry North Block',
          perimeterMeters: 30,
          polygon: [
            GeoPoint(lat: 47.664100, lng: -122.318200),
            GeoPoint(lat: 47.664100, lng: -122.313200),
            GeoPoint(lat: 47.661600, lng: -122.313200),
            GeoPoint(lat: 47.661600, lng: -122.318200),
          ],
        ),
      ],
      settings: AdminSettings(
        feedSuggestionMinG: 85,
        feedSuggestionMaxG: 120,
        rewardSmallG: 2,
        rewardMediumG: 5,
        rewardLargeG: 10,
        rewardPickUpPieceG: 0,
        starlingQuickCounts: const [5, 25, 50, 100, 500],
      ),
      sessions: const [],
      supportQuestions: const [],
      adminQuestions: const [],
      customerInputs: const [],
    );
  }
}
