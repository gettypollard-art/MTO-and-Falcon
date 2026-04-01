import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:math' as math;
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:geolocator/geolocator.dart';
import 'package:http/http.dart' as http;
import 'package:intl/intl.dart';
import 'package:latlong2/latlong.dart';
import 'package:path_provider/path_provider.dart';
import 'package:speech_to_text/speech_to_text.dart';

import 'app_controller.dart';
import 'local_store.dart';
import 'models.dart';
import 'notification_service.dart';

const Color kEntryBlue = Color(0xFFD4E5FF);
const Color kEntryBlueDark = Color(0xFF0D47A1);

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(const FalconApp());
}

class FalconApp extends StatefulWidget {
  const FalconApp({super.key});

  @override
  State<FalconApp> createState() => _FalconAppState();
}

class _FalconAppState extends State<FalconApp> {
  late final FalconAppController _controller;
  final GlobalKey<NavigatorState> _navigatorKey = GlobalKey<NavigatorState>();
  bool _showWelcome = true;

  @override
  void initState() {
    super.initState();
    _controller = FalconAppController(LocalStore());
    unawaited(_bootstrap());
  }

  Future<void> _bootstrap() async {
    await _controller.initialize();
    await NotificationService.instance.initialize(
      onTapNotification: _handleNotificationTap,
    );
    await NotificationService.instance.scheduleDailyBeforeBedPrompt();
  }

  void _handleNotificationTap(String? payload) {
    if (payload != NotificationService.beforeBedPayload) {
      return;
    }
    final nav = _navigatorKey.currentState;
    if (nav == null || !_controller.isLoggedIn) {
      return;
    }
    nav.push(
      MaterialPageRoute(
        builder: (_) => BeforeBedScreen(controller: _controller),
      ),
    );
  }

  Future<void> _promptAdminAccess() async {
    final navContext = _navigatorKey.currentContext;
    if (navContext == null) {
      return;
    }

    final usernameController = TextEditingController();
    final passwordController = TextEditingController();
    String? errorText;

    final approved = await showDialog<bool>(
      context: navContext,
      builder: (dialogContext) {
        return StatefulBuilder(
          builder: (dialogContext, setDialogState) {
            return AlertDialog(
              title: const Text('Admin Login'),
              content: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  TextField(
                    controller: usernameController,
                    textCapitalization: TextCapitalization.none,
                    decoration: const InputDecoration(labelText: 'Username'),
                  ),
                  const SizedBox(height: 10),
                  TextField(
                    controller: passwordController,
                    textCapitalization: TextCapitalization.none,
                    obscureText: true,
                    decoration: const InputDecoration(labelText: 'Password'),
                  ),
                  if (errorText != null) ...[
                    const SizedBox(height: 8),
                    Text(
                      errorText!,
                      style: const TextStyle(
                        color: Color(0xFFB91C1C),
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ],
                ],
              ),
              actions: [
                TextButton(
                  onPressed: () => Navigator.of(dialogContext).pop(false),
                  child: const Text('Cancel'),
                ),
                FilledButton(
                  onPressed: () {
                    final username = usernameController.text.trim();
                    final password = passwordController.text.trim();
                    if (username == 'a' && password == '1') {
                      Navigator.of(dialogContext).pop(true);
                      return;
                    }
                    setDialogState(() => errorText = 'Invalid admin login.');
                  },
                  child: const Text('Login'),
                ),
              ],
            );
          },
        );
      },
    );

    if (approved == true && mounted) {
      _controller.useDefaultAdmin();
      setState(() => _showWelcome = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      navigatorKey: _navigatorKey,
      title: 'Falcon Log 1.0 B1RD App',
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(
          seedColor: kEntryBlueDark,
          brightness: Brightness.light,
        ),
        scaffoldBackgroundColor: const Color(0xFFF5F5ED),
        appBarTheme: const AppBarTheme(centerTitle: false),
        inputDecorationTheme: const InputDecorationTheme(
          filled: true,
          fillColor: kEntryBlue,
          enabledBorder: OutlineInputBorder(
            borderSide: BorderSide(color: kEntryBlueDark),
          ),
          focusedBorder: OutlineInputBorder(
            borderSide: BorderSide(color: kEntryBlueDark, width: 1.6),
          ),
        ),
        filledButtonTheme: FilledButtonThemeData(
          style: FilledButton.styleFrom(
            backgroundColor: kEntryBlueDark,
            foregroundColor: Colors.white,
          ),
        ),
        useMaterial3: true,
      ),
      home: AnimatedBuilder(
        animation: _controller,
        builder: (context, _) => _rootScreen(),
      ),
    );
  }

  Widget _rootScreen() {
    if (_controller.isLoading) {
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
    }

    if (_showWelcome) {
      return WelcomeScreen(
        onUserPressed: () {
          _controller.useDefaultUser();
          setState(() => _showWelcome = false);
        },
        onAdminPressed: () {
          unawaited(_promptAdminAccess());
        },
      );
    }

    if (!_controller.isLoggedIn) {
      return LoginScreen(controller: _controller);
    }

    if (_controller.currentUser?.role == UserRole.manager) {
      return AdminHomeScreen(
        controller: _controller,
        onBackToRoleSelect: () {
          _controller.logout();
          setState(() => _showWelcome = true);
        },
      );
    }

    return HomeScreen(
      controller: _controller,
      onBackToRoleSelect: () {
        _controller.logout();
        setState(() => _showWelcome = true);
      },
    );
  }
}

class WelcomeScreen extends StatelessWidget {
  const WelcomeScreen({
    super.key,
    required this.onUserPressed,
    required this.onAdminPressed,
  });

  final VoidCallback onUserPressed;
  final VoidCallback onAdminPressed;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFE6F4FF),
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const _PeregrineFalconHeroCard(),
              const SizedBox(height: 18),
              const Text(
                'B-1RD',
                textAlign: TextAlign.center,
                style: TextStyle(fontSize: 50, fontWeight: FontWeight.w900),
              ),
              const SizedBox(height: 12),
              const Text(
                'Falcon Crop Protection Falcon Log',
                textAlign: TextAlign.center,
                style: TextStyle(fontSize: 20, fontWeight: FontWeight.w600),
              ),
              const SizedBox(height: 36),
              FilledButton(
                onPressed: onUserPressed,
                child: const Text('FALCON SPECIALISTS'),
              ),
              const SizedBox(height: 10),
              OutlinedButton(
                onPressed: onAdminPressed,
                child: const Text('ADMIN'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class AdminHomeScreen extends StatefulWidget {
  const AdminHomeScreen({
    super.key,
    required this.controller,
    required this.onBackToRoleSelect,
  });

  final FalconAppController controller;
  final VoidCallback onBackToRoleSelect;

  @override
  State<AdminHomeScreen> createState() => _AdminHomeScreenState();
}

class _AdminHomeScreenState extends State<AdminHomeScreen> {
  final Set<String> _expandedHandlerIds = <String>{};

  @override
  Widget build(BuildContext context) {
    final now = DateTime.now();
    final startOfToday = DateTime(now.year, now.month, now.day);
    final endOfToday = startOfToday.add(const Duration(days: 1));
    final users = widget.controller.handlerUsers;
    final handlerMetrics = users.map((user) {
      final sessions = widget.controller.sessionsForHandler(user.id);
      final flyingSessionsToday = widget.controller
          .flyingSessionsForHandlerBetween(
            handlerId: user.id,
            fromInclusive: startOfToday,
            toExclusive: endOfToday,
          );
      final flyingHoursToday =
          widget.controller.flyingMinutesForHandlerBetween(
            handlerId: user.id,
            fromInclusive: startOfToday,
            toExclusive: endOfToday,
          ) /
          60;
      final feedAlerts = widget.controller.feedComplianceAlertsForHandler(
        user.id,
      );
      final feedNeededG = feedAlerts.fold<double>(
        0,
        (sum, alert) => sum + (alert.requiredGrams - alert.actualGrams),
      );
      final voiceNotesToday = sessions
          .where((session) => (session.voiceTranscript ?? '').trim().isNotEmpty)
          .where(
            (session) => session.events.any(
              (event) =>
                  event.type == SessionEventType.flyingStart &&
                  !event.at.isBefore(startOfToday) &&
                  event.at.isBefore(endOfToday),
            ),
          )
          .toList();
      final customerInputsToday = widget.controller
          .customerInputsForHandlerBetween(
            handlerId: user.id,
            fromInclusive: startOfToday,
            toExclusive: endOfToday,
          );
      final lastEntryAt = widget.controller.lastDataEntryAtForHandler(
        user.id,
        reference: now,
      );
      return (
        user: user,
        flyingSessionsToday: flyingSessionsToday,
        flyingHoursToday: flyingHoursToday,
        feedAlerts: feedAlerts,
        feedNeededG: feedNeededG < 0 ? 0 : feedNeededG,
        voiceNotesToday: voiceNotesToday,
        customerInputsToday: customerInputsToday,
        drillExpanded: _expandedHandlerIds.contains(user.id),
        lastEntryAt: lastEntryAt,
      );
    }).toList();

    return Scaffold(
      appBar: AppBar(
        leading: IconButton(
          tooltip: 'Back',
          onPressed: widget.onBackToRoleSelect,
          icon: const Icon(Icons.arrow_back),
        ),
        title: const Text('Admin Dashboard'),
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Card(
            color: const Color(0xFFE8F0FF),
            child: Padding(
              padding: const EdgeInsets.all(12),
              child: Wrap(
                spacing: 12,
                runSpacing: 8,
                children: [
                  _AdminMetric(
                    label: 'Handlers',
                    value: '${users.length}',
                    icon: Icons.group,
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 10),
          const Text(
            'Falcon Specialist Metrics',
            style: TextStyle(fontSize: 16, fontWeight: FontWeight.w800),
          ),
          const SizedBox(height: 8),
          ...handlerMetrics.map((item) {
            return Card(
              color: const Color(0xFFF7FAFF),
              child: Padding(
                padding: const EdgeInsets.all(12),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      item.user.name,
                      style: const TextStyle(
                        fontWeight: FontWeight.w800,
                        fontSize: 16,
                      ),
                    ),
                    const SizedBox(height: 8),
                    Wrap(
                      spacing: 8,
                      runSpacing: 8,
                      children: [
                        _AdminMetric(
                          label: 'Flying Sessions Today',
                          value: '${item.flyingSessionsToday}',
                          icon: Icons.flight_takeoff,
                        ),
                        _AdminMetric(
                          label: 'Flying Hours Today',
                          value: '${item.flyingHoursToday.toStringAsFixed(1)}h',
                          icon: Icons.query_stats,
                        ),
                        _AdminMetric(
                          label: 'Voice Notes Today',
                          value: '${item.voiceNotesToday.length}',
                          icon: Icons.mic,
                          onTap: item.voiceNotesToday.isEmpty
                              ? null
                              : () => _showVoiceNotesDialog(
                                  context,
                                  item.user,
                                  item.voiceNotesToday,
                                ),
                        ),
                        _AdminMetric(
                          label: 'Customer Input Today',
                          value: item.customerInputsToday > 0
                              ? 'Active (${item.customerInputsToday})'
                              : 'No Entry',
                          icon: Icons.record_voice_over,
                          backgroundColor: item.customerInputsToday > 0
                              ? const Color(0xFFE8F8EC)
                              : const Color(0xFFF3F4F6),
                        ),
                        _AdminMetric(
                          label: 'Feed Alerts',
                          value: item.feedAlerts.isEmpty
                              ? 'None'
                              : '${item.feedAlerts.length}',
                          icon: Icons.feed_outlined,
                          onTap: () => _showFeedAlertsDialog(
                            context,
                            item.user,
                            item.feedAlerts,
                          ),
                        ),
                        _DataEntryAgeMetric(lastEntryAt: item.lastEntryAt),
                        _AdminMetric(
                          label: 'Falcon Spreadsheets',
                          value: item.drillExpanded ? 'Hide' : 'Show',
                          icon: Icons.table_view,
                          onTap: () => _toggleHandlerDrill(item.user.id),
                        ),
                      ],
                    ),
                    const SizedBox(height: 8),
                    Text(
                      'Falcon still needed to be fed amount: ${item.feedNeededG.toStringAsFixed(1)}g',
                      style: TextStyle(
                        fontSize: 12.5,
                        fontWeight: FontWeight.w700,
                        color: item.feedNeededG > 0
                            ? const Color(0xFFB91C1C)
                            : const Color(0xFF1B5E20),
                      ),
                    ),
                    if (item.drillExpanded) ...[
                      const SizedBox(height: 8),
                      Container(
                        width: double.infinity,
                        padding: const EdgeInsets.all(10),
                        decoration: BoxDecoration(
                          color: const Color(0xFFEFF5FF),
                          borderRadius: BorderRadius.circular(10),
                          border: Border.all(color: const Color(0xFFBFD2F7)),
                        ),
                        child: Row(
                          children: [
                            const Expanded(
                              child: Text(
                                'Open this handler\'s falcon spreadsheets.',
                                style: TextStyle(
                                  fontSize: 12.5,
                                  fontWeight: FontWeight.w600,
                                ),
                              ),
                            ),
                            const SizedBox(width: 8),
                            FilledButton.tonalIcon(
                              onPressed: () =>
                                  _openAdminUserDetail(context, item.user.id),
                              icon: const Icon(Icons.chevron_right),
                              label: const Text('Open'),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ],
                ),
              ),
            );
          }),
        ],
      ),
    );
  }

  void _toggleHandlerDrill(String handlerId) {
    setState(() {
      if (_expandedHandlerIds.contains(handlerId)) {
        _expandedHandlerIds.remove(handlerId);
      } else {
        _expandedHandlerIds.add(handlerId);
      }
    });
  }

  void _openAdminUserDetail(BuildContext context, String handlerId) {
    Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => AdminUserDetailScreen(
          controller: widget.controller,
          handlerId: handlerId,
        ),
      ),
    );
  }

  Future<void> _showFeedAlertsDialog(
    BuildContext context,
    HandlerUser user,
    List<FeedComplianceAlert> alerts,
  ) async {
    await showDialog<void>(
      context: context,
      builder: (dialogContext) {
        return AlertDialog(
          title: Text('Feed Alerts · ${user.name}'),
          content: SizedBox(
            width: 360,
            child: alerts.isEmpty
                ? const Text('No feed alerts in the last 24 hours.')
                : ListView(
                    shrinkWrap: true,
                    children: alerts.map((alert) {
                      final needed = (alert.requiredGrams - alert.actualGrams)
                          .clamp(0, double.infinity);
                      return Padding(
                        padding: const EdgeInsets.only(bottom: 6),
                        child: Text(
                          '${alert.falconName}: Falcon still needed to be fed amount ${needed.toStringAsFixed(1)}g',
                          style: const TextStyle(
                            fontSize: 12.5,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      );
                    }).toList(),
                  ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(dialogContext).pop(),
              child: const Text('Close'),
            ),
          ],
        );
      },
    );
  }

  Future<void> _showVoiceNotesDialog(
    BuildContext context,
    HandlerUser user,
    List<SessionRecord> sessions,
  ) async {
    final sorted = [...sessions]
      ..sort((a, b) => b.startAt.compareTo(a.startAt));
    await showDialog<void>(
      context: context,
      builder: (dialogContext) {
        return AlertDialog(
          title: Text('Voice Notes · ${user.name}'),
          content: SizedBox(
            width: 380,
            child: sorted.isEmpty
                ? const Text('No voice notes for falcons flown today.')
                : ListView(
                    shrinkWrap: true,
                    children: sorted.map((session) {
                      final transcript = (session.voiceTranscript ?? '').trim();
                      final falconName = widget.controller
                          .falconById(session.falconId)
                          .name;
                      return Padding(
                        padding: const EdgeInsets.only(bottom: 10),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              '$falconName · ${_fmtDate(session.startAt)}',
                              style: const TextStyle(
                                fontWeight: FontWeight.w700,
                                fontSize: 12.5,
                              ),
                            ),
                            const SizedBox(height: 2),
                            Text(
                              transcript,
                              style: const TextStyle(fontSize: 12.5),
                            ),
                          ],
                        ),
                      );
                    }).toList(),
                  ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(dialogContext).pop(),
              child: const Text('Close'),
            ),
          ],
        );
      },
    );
  }
}

class _AdminMetric extends StatelessWidget {
  const _AdminMetric({
    required this.label,
    required this.value,
    required this.icon,
    this.backgroundColor = Colors.white,
    this.alert = false,
    this.onTap,
  });

  final String label;
  final String value;
  final IconData icon;
  final Color backgroundColor;
  final bool alert;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final metric = Container(
      constraints: const BoxConstraints(minWidth: 108, maxWidth: 145),
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 7),
      decoration: BoxDecoration(
        color: backgroundColor,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(
          color: alert ? const Color(0xFFEF4444) : const Color(0xFFBFD2F7),
          width: alert ? 1.6 : 1,
        ),
        boxShadow: alert
            ? const [
                BoxShadow(
                  color: Color(0x66EF4444),
                  blurRadius: 12,
                  spreadRadius: 1,
                ),
              ]
            : null,
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 16, color: const Color(0xFF0A2C5A)),
          const SizedBox(width: 6),
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                label,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(fontSize: 10, color: Colors.black54),
              ),
              Text(
                value,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(
                  fontSize: 14.5,
                  fontWeight: FontWeight.w800,
                ),
              ),
            ],
          ),
        ],
      ),
    );
    if (onTap == null) {
      return metric;
    }
    return Material(
      color: Colors.transparent,
      child: InkWell(
        borderRadius: BorderRadius.circular(10),
        onTap: onTap,
        child: metric,
      ),
    );
  }
}

class _DataEntryAgeMetric extends StatefulWidget {
  const _DataEntryAgeMetric({required this.lastEntryAt});

  final DateTime? lastEntryAt;

  @override
  State<_DataEntryAgeMetric> createState() => _DataEntryAgeMetricState();
}

class _DataEntryAgeMetricState extends State<_DataEntryAgeMetric> {
  Timer? _ticker;

  @override
  void initState() {
    super.initState();
    _ticker = Timer.periodic(const Duration(minutes: 1), (_) {
      if (mounted) {
        setState(() {});
      }
    });
  }

  @override
  void dispose() {
    _ticker?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final now = DateTime.now();
    final hoursSince = widget.lastEntryAt == null
        ? null
        : now.difference(widget.lastEntryAt!).inSeconds / 3600;
    final noDataFor24Hours = hoursSince == null || hoursSince >= 24;
    final value = hoursSince == null
        ? 'No data'
        : '${hoursSince.toStringAsFixed(1)}h';

    return _AdminMetric(
      label: 'Data Entry 24h',
      value: value,
      icon: Icons.schedule,
      backgroundColor: const Color(0xFFE8F0FF),
      alert: noDataFor24Hours,
    );
  }
}

class AdminUserDetailScreen extends StatelessWidget {
  const AdminUserDetailScreen({
    super.key,
    required this.controller,
    required this.handlerId,
  });

  final FalconAppController controller;
  final String handlerId;

  @override
  Widget build(BuildContext context) {
    final user = controller.handlerById(handlerId);
    final sessions = controller.sessionsForHandler(handlerId);
    final falcons = controller.falconsForHandler(handlerId);
    final questions = controller.adminQuestionsForHandler(handlerId);
    final pendingCount = questions.where((item) => !item.isAnswered).length;
    return Scaffold(
      appBar: AppBar(title: Text('Admin · ${user.name}')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Card(
            color: const Color(0xFFE8F0FF),
            child: Padding(
              padding: const EdgeInsets.all(12),
              child: Row(
                children: [
                  Expanded(
                    child: Text(
                      'Sessions: ${sessions.length}\nFalcons: ${falcons.length}\nPending questions: $pendingCount',
                      style: const TextStyle(
                        fontWeight: FontWeight.w700,
                        height: 1.35,
                      ),
                    ),
                  ),
                  FilledButton.icon(
                    onPressed: () => _askQuestion(context),
                    icon: const Icon(Icons.campaign),
                    label: const Text('Ask Question'),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 10),
          const Text(
            'Falcon spreadsheets',
            style: TextStyle(fontWeight: FontWeight.w800, fontSize: 16),
          ),
          const SizedBox(height: 6),
          ...falcons.map((falcon) {
            final falconSessions = controller.sessionsForFalcon(
              handlerId: handlerId,
              falconId: falcon.id,
            );
            return Card(
              child: ListTile(
                title: Text(
                  falcon.name,
                  style: const TextStyle(fontWeight: FontWeight.w800),
                ),
                subtitle: Text('${falconSessions.length} rows'),
                trailing: const Icon(Icons.table_view),
                onTap: () {
                  Navigator.of(context).push(
                    MaterialPageRoute(
                      builder: (_) => AdminFalconSpreadsheetScreen(
                        controller: controller,
                        handlerId: handlerId,
                        falconId: falcon.id,
                      ),
                    ),
                  );
                },
              ),
            );
          }),
          const SizedBox(height: 10),
          const Text(
            'Admin questions to user',
            style: TextStyle(fontWeight: FontWeight.w800, fontSize: 16),
          ),
          const SizedBox(height: 6),
          if (questions.isEmpty)
            const Card(
              child: Padding(
                padding: EdgeInsets.all(12),
                child: Text('No admin questions sent yet.'),
              ),
            )
          else
            ...questions.map((question) {
              final answered = question.isAnswered;
              return Card(
                child: ListTile(
                  leading: Icon(
                    answered
                        ? Icons.check_circle
                        : Icons.notification_important,
                    color: answered
                        ? const Color(0xFF1B5E20)
                        : const Color(0xFFB91C1C),
                  ),
                  title: Text(question.questionText),
                  subtitle: Text(
                    answered
                        ? '${_fmtDate(question.askedAt)}\nAnswer: ${question.answerText ?? ''}'
                        : '${_fmtDate(question.askedAt)} · Awaiting user answer',
                  ),
                  isThreeLine: answered,
                ),
              );
            }),
        ],
      ),
    );
  }

  Future<void> _askQuestion(BuildContext context) async {
    final textController = TextEditingController();
    String? error;
    final rootDialogContext = Navigator.of(
      context,
      rootNavigator: true,
    ).context;
    final sent = await showDialog<bool>(
      context: rootDialogContext,
      useRootNavigator: true,
      builder: (dialogContext) {
        return StatefulBuilder(
          builder: (dialogContext, setDialogState) {
            return AlertDialog(
              title: const Text('Ask User a Question'),
              content: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  TextField(
                    controller: textController,
                    maxLines: 4,
                    decoration: const InputDecoration(
                      labelText: 'Question',
                      hintText: 'Enter question for this user',
                    ),
                  ),
                  if (error != null) ...[
                    const SizedBox(height: 8),
                    Text(
                      error!,
                      style: const TextStyle(
                        color: Color(0xFFB91C1C),
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ],
                ],
              ),
              actions: [
                TextButton(
                  onPressed: () => Navigator.of(dialogContext).pop(false),
                  child: const Text('Cancel'),
                ),
                FilledButton(
                  onPressed: () async {
                    try {
                      await controller.askUserQuestion(
                        handlerId: handlerId,
                        questionText: textController.text,
                      );
                      if (dialogContext.mounted) {
                        Navigator.of(dialogContext).pop(true);
                      }
                    } catch (e) {
                      setDialogState(() => error = e.toString());
                    }
                  },
                  child: const Text('Send'),
                ),
              ],
            );
          },
        );
      },
    );
    textController.dispose();
    if (sent == true && context.mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Question sent. User will be prompted live in-app.'),
        ),
      );
    }
  }
}

class AdminFalconSpreadsheetScreen extends StatefulWidget {
  const AdminFalconSpreadsheetScreen({
    super.key,
    required this.controller,
    required this.handlerId,
    required this.falconId,
  });

  final FalconAppController controller;
  final String handlerId;
  final String falconId;

  @override
  State<AdminFalconSpreadsheetScreen> createState() =>
      _AdminFalconSpreadsheetScreenState();
}

class _AdminFalconSpreadsheetScreenState
    extends State<AdminFalconSpreadsheetScreen> {
  bool _exporting = false;

  @override
  Widget build(BuildContext context) {
    final user = widget.controller.handlerById(widget.handlerId);
    final falcon = widget.controller.falconById(widget.falconId);
    final sessions = widget.controller.sessionsForFalcon(
      handlerId: widget.handlerId,
      falconId: widget.falconId,
    );
    return Scaffold(
      appBar: AppBar(
        title: Text('${user.name} · ${falcon.name}'),
        actions: [
          IconButton(
            tooltip: 'Export CSV (Excel)',
            onPressed: _exporting ? null : () => _exportCsv(context, sessions),
            icon: _exporting
                ? const SizedBox(
                    width: 18,
                    height: 18,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : const Icon(Icons.download),
          ),
        ],
      ),
      body: sessions.isEmpty
          ? const Center(
              child: Text(
                'No rows yet for this falcon.\nData will appear as sessions are logged.',
                textAlign: TextAlign.center,
              ),
            )
          : ListView(
              padding: const EdgeInsets.all(12),
              children: [
                const Text(
                  'Excel Layout: Date, Start, End, Flights, Session (h), Flying (h), Max mph, Feed Ate (g), Feed Plan (g), Weight (g), Starlings, Catch, Chase, Ignore, Max Alt (ft), Voice Notes (Text).',
                  style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w700),
                ),
                const SizedBox(height: 8),
                SingleChildScrollView(
                  scrollDirection: Axis.horizontal,
                  child: DataTable(
                    headingRowColor: WidgetStateProperty.all(
                      const Color(0xFFF3F4F6),
                    ),
                    columnSpacing: 14,
                    columns: const [
                      DataColumn(label: Text('Date')),
                      DataColumn(label: Text('Start')),
                      DataColumn(label: Text('End')),
                      DataColumn(label: Text('# Flights')),
                      DataColumn(label: Text('Session (h)')),
                      DataColumn(label: Text('Flying (h)')),
                      DataColumn(label: Text('Max mph')),
                      DataColumn(label: Text('Feed Ate (g)')),
                      DataColumn(label: Text('Feed Plan (g)')),
                      DataColumn(label: Text('Weight (g)')),
                      DataColumn(label: Text('Starlings')),
                      DataColumn(label: Text('Catch')),
                      DataColumn(label: Text('Chase')),
                      DataColumn(label: Text('Ignore')),
                      DataColumn(label: Text('Max Alt (ft)')),
                      DataColumn(label: Text('Voice Notes (Text)')),
                    ],
                    rows: sessions.map((session) {
                      return DataRow(
                        cells: [
                          DataCell(
                            Text(
                              DateFormat('M/d/yyyy').format(session.startAt),
                            ),
                          ),
                          DataCell(
                            Text(DateFormat('h:mm a').format(session.startAt)),
                          ),
                          DataCell(
                            Text(
                              session.endAt == null
                                  ? '-'
                                  : DateFormat('h:mm a').format(session.endAt!),
                            ),
                          ),
                          DataCell(
                            Text(
                              '${widget.controller.completedFlights(session)}',
                            ),
                          ),
                          DataCell(
                            Text(
                              (widget.controller.sessionMinutes(session) / 60)
                                  .toStringAsFixed(2),
                            ),
                          ),
                          DataCell(
                            Text(
                              (widget.controller.flyingMinutes(session) / 60)
                                  .toStringAsFixed(2),
                            ),
                          ),
                          DataCell(
                            Text(
                              session.maxSpeedMph == null
                                  ? '-'
                                  : session.maxSpeedMph!.toStringAsFixed(1),
                            ),
                          ),
                          DataCell(
                            Text('${widget.controller.foodUsedG(session)}'),
                          ),
                          DataCell(Text('${session.plannedFoodG}')),
                          DataCell(
                            Text(session.falconWeightG.toStringAsFixed(1)),
                          ),
                          DataCell(
                            Text(
                              '${widget.controller.totalStarlingCount(session)}',
                            ),
                          ),
                          DataCell(
                            Text(
                              '${widget.controller.pursuitOutcomeCount(session, PursuitOutcome.kill)}',
                            ),
                          ),
                          DataCell(
                            Text(
                              '${widget.controller.pursuitOutcomeCount(session, PursuitOutcome.chase)}',
                            ),
                          ),
                          DataCell(
                            Text(
                              '${widget.controller.pursuitOutcomeCount(session, PursuitOutcome.ignore)}',
                            ),
                          ),
                          DataCell(
                            Text(
                              session.maxAltitudeFt == null
                                  ? '-'
                                  : session.maxAltitudeFt!.toStringAsFixed(0),
                            ),
                          ),
                          DataCell(
                            SizedBox(
                              width: 240,
                              child: Text(
                                _voiceTranscriptText(session.voiceTranscript),
                                maxLines: 3,
                                overflow: TextOverflow.ellipsis,
                              ),
                            ),
                          ),
                        ],
                      );
                    }).toList(),
                  ),
                ),
              ],
            ),
    );
  }

  Future<void> _exportCsv(
    BuildContext context,
    List<SessionRecord> sessions,
  ) async {
    if (sessions.isEmpty) {
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(const SnackBar(content: Text('No rows to export yet.')));
      return;
    }
    setState(() => _exporting = true);
    try {
      final user = widget.controller.handlerById(widget.handlerId);
      final falcon = widget.controller.falconById(widget.falconId);
      final lines = <String>[];
      lines.add(
        'Date,Start,End,# Flights,Session (h),Flying (h),Max mph,Feed Ate (g),Feed Plan (g),Weight (g),Starlings,Catch,Chase,Ignore,Max Alt (ft),Voice Notes (Text)',
      );
      for (final session in sessions) {
        final row = [
          DateFormat('M/d/yyyy').format(session.startAt),
          DateFormat('h:mm a').format(session.startAt),
          session.endAt == null
              ? '-'
              : DateFormat('h:mm a').format(session.endAt!),
          '${widget.controller.completedFlights(session)}',
          (widget.controller.sessionMinutes(session) / 60).toStringAsFixed(2),
          (widget.controller.flyingMinutes(session) / 60).toStringAsFixed(2),
          session.maxSpeedMph?.toStringAsFixed(1) ?? '-',
          '${widget.controller.foodUsedG(session)}',
          '${session.plannedFoodG}',
          session.falconWeightG.toStringAsFixed(1),
          '${widget.controller.totalStarlingCount(session)}',
          '${widget.controller.pursuitOutcomeCount(session, PursuitOutcome.kill)}',
          '${widget.controller.pursuitOutcomeCount(session, PursuitOutcome.chase)}',
          '${widget.controller.pursuitOutcomeCount(session, PursuitOutcome.ignore)}',
          session.maxAltitudeFt?.toStringAsFixed(0) ?? '-',
          _voiceTranscriptText(session.voiceTranscript),
        ];
        lines.add(row.map(_csvCell).join(','));
      }

      final docs = await getApplicationDocumentsDirectory();
      final exportDir = Directory('${docs.path}/admin_exports');
      if (!await exportDir.exists()) {
        await exportDir.create(recursive: true);
      }
      final safeUser = user.name.replaceAll(RegExp(r'[^A-Za-z0-9]+'), '_');
      final safeFalcon = falcon.name.replaceAll(RegExp(r'[^A-Za-z0-9]+'), '_');
      final file = File('${exportDir.path}/$safeUser\_$safeFalcon.csv');
      await file.writeAsString(lines.join('\n'));
      if (!context.mounted) {
        return;
      }
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Excel CSV exported: ${file.path}')),
      );
    } catch (e) {
      if (!context.mounted) {
        return;
      }
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text('Export failed: $e')));
    } finally {
      if (mounted) {
        setState(() => _exporting = false);
      }
    }
  }

  String _csvCell(String value) {
    final escaped = value.replaceAll('"', '""');
    return '"$escaped"';
  }

  String _voiceTranscriptText(String? transcript) {
    final value = transcript?.trim() ?? '';
    if (value.isEmpty) {
      return '-';
    }
    return value.replaceAll(RegExp(r'\s+'), ' ');
  }
}

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key, required this.controller});

  final FalconAppController controller;

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _handlerIdController = TextEditingController();
  final _pinController = TextEditingController();
  String? _error;

  @override
  void dispose() {
    _handlerIdController.dispose();
    _pinController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFE6F4FF),
      appBar: AppBar(title: const Text('Falcon Crop Protection Login')),
      body: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const Text(
              'Falcon Specialist ID and PIN.',
              style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
            ),
            const SizedBox(height: 16),
            TextField(
              controller: _handlerIdController,
              decoration: const InputDecoration(
                border: OutlineInputBorder(),
                labelText: 'Falcon Specialist ID',
              ),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _pinController,
              keyboardType: TextInputType.number,
              obscureText: true,
              decoration: const InputDecoration(
                border: OutlineInputBorder(),
                labelText: 'PIN',
              ),
            ),
            if (_error != null) ...[
              const SizedBox(height: 8),
              Text(_error!, style: const TextStyle(color: Colors.red)),
            ],
            const SizedBox(height: 16),
            FilledButton(onPressed: _onLogin, child: const Text('Sign In')),
          ],
        ),
      ),
    );
  }

  void _onLogin() {
    final handlerId = _handlerIdController.text.trim();
    if (handlerId.isEmpty) {
      setState(() => _error = 'Enter your Falcon Specialist ID.');
      return;
    }

    final ok = widget.controller.login(
      handlerId: handlerId,
      pin: _pinController.text.trim(),
    );

    if (!ok) {
      setState(() => _error = 'Invalid PIN.');
      return;
    }

    setState(() => _error = null);
  }
}

class _HomeForecastDay {
  const _HomeForecastDay({
    required this.dayLabel,
    required this.highF,
    required this.lowF,
    required this.rainPercent,
  });

  final String dayLabel;
  final double? highF;
  final double? lowF;
  final double? rainPercent;
}

class HomeScreen extends StatefulWidget {
  const HomeScreen({
    super.key,
    required this.controller,
    required this.onBackToRoleSelect,
  });

  final FalconAppController controller;
  final VoidCallback onBackToRoleSelect;

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  bool _loadingHomeWeather = true;
  String? _homeWeatherError;
  double? _homeTemperatureF;
  double? _homeHighTemperatureF;
  double? _homeLowTemperatureF;
  int? _homeHumidityPercent;
  double? _homeWindMph;
  double? _homeWindDirectionDegrees;
  int? _homeCloudCoverPercent;
  double? _homePrecipitationMm;
  int? _homeAirQualityIndex;
  List<_HomeForecastDay> _homeSevenDayForecast = const [];
  final Map<String, TextEditingController> _supplementalFeedControllers = {};
  final Set<String> _shownAdminQuestionIds = {};
  Timer? _adminQuestionTimer;
  bool _checkingAdminQuestion = false;
  bool _adminQuestionDialogOpen = false;

  @override
  void initState() {
    super.initState();
    unawaited(_loadHomeWeather());
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) {
        return;
      }
      unawaited(_showPendingAdminQuestionIfNeeded());
    });
    _adminQuestionTimer = Timer.periodic(const Duration(seconds: 3), (_) {
      if (!mounted) {
        return;
      }
      unawaited(_showPendingAdminQuestionIfNeeded());
    });
  }

  @override
  void dispose() {
    _adminQuestionTimer?.cancel();
    for (final controller in _supplementalFeedControllers.values) {
      controller.dispose();
    }
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final user = widget.controller.currentUser!;
    final active = widget.controller.activeSession;
    final alerts = widget.controller.feedComplianceAlerts();
    final isAdmin = user.role == UserRole.manager;
    final activePatrol = widget.controller.activePatrolWithoutFalcon;
    final patrolWithoutFalconActive = activePatrol != null;
    final now = DateTime.now();
    final startOfToday = DateTime(now.year, now.month, now.day);
    final patrolTotalHours =
        widget.controller.totalPatrolWithoutFalconMinutes() / 60;
    final patrolTodayHours =
        widget.controller.totalPatrolWithoutFalconMinutes(since: startOfToday) /
        60;

    return Scaffold(
      appBar: AppBar(
        leading: IconButton(
          tooltip: 'Back',
          onPressed: widget.onBackToRoleSelect,
          icon: const Icon(Icons.arrow_back),
        ),
        title: Text('Welcome, ${user.name}'),
        actions: [
          IconButton(
            tooltip: 'Mark all synced',
            onPressed: () async {
              await widget.controller.markAllSessionsSynced();
              if (context.mounted) {
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(
                    content: Text('All sessions marked as synced.'),
                  ),
                );
              }
            },
            icon: Badge(
              label: Text('${widget.controller.unsyncedCount}'),
              isLabelVisible: widget.controller.unsyncedCount > 0,
              child: const Icon(Icons.sync),
            ),
          ),
          IconButton(
            tooltip: 'Ask a Question',
            onPressed: () {
              Navigator.of(context).push(
                MaterialPageRoute(
                  builder: (_) =>
                      AskQuestionScreen(controller: widget.controller),
                ),
              );
            },
            icon: const Icon(Icons.help_outline),
          ),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          if (active != null)
            Card(
              color: const Color(0xFFFFF2D8),
              child: ListTile(
                title: const Text('Active Session'),
                subtitle: Text(
                  '${widget.controller.falconById(active.falconId).name} · ${_fmtDate(active.startAt)}',
                ),
                trailing: FilledButton(
                  onPressed: () {
                    Navigator.of(context).push(
                      MaterialPageRoute(
                        builder: (_) => LiveSessionScreen(
                          controller: widget.controller,
                          sessionId: active.id,
                        ),
                      ),
                    );
                  },
                  child: const Text('Resume'),
                ),
              ),
            ),
          const SizedBox(height: 8),
          FilledButton.icon(
            onPressed: active != null
                ? null
                : () {
                    Navigator.of(context).push(
                      MaterialPageRoute(
                        builder: (_) =>
                            ReadyToFlyScreen(controller: widget.controller),
                      ),
                    );
                  },
            icon: const Icon(Icons.play_arrow),
            label: const Text('Start New Falcon Flying Session'),
          ),
          const SizedBox(height: 8),
          Row(
            children: [
              Expanded(
                child: FilledButton.icon(
                  onPressed: patrolWithoutFalconActive
                      ? null
                      : () async {
                          try {
                            await widget.controller.startPatrolWithoutFalcon();
                            if (!context.mounted) {
                              return;
                            }
                            ScaffoldMessenger.of(context).showSnackBar(
                              const SnackBar(
                                content: Text('Patrol without falcon started.'),
                              ),
                            );
                          } catch (error) {
                            if (!context.mounted) {
                              return;
                            }
                            ScaffoldMessenger.of(context).showSnackBar(
                              SnackBar(content: Text(error.toString())),
                            );
                          }
                        },
                  icon: const Icon(Icons.directions_bike),
                  label: const Text('Patrol without Falcon Start'),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: FilledButton.icon(
                  style: FilledButton.styleFrom(
                    backgroundColor: const Color(0xFFC92A2A),
                    foregroundColor: Colors.white,
                  ),
                  onPressed: patrolWithoutFalconActive
                      ? () async {
                          try {
                            final stopped = await widget.controller
                                .stopPatrolWithoutFalcon();
                            final elapsed = (stopped.endAt ?? DateTime.now())
                                .difference(stopped.startAt);
                            final mins = elapsed.inMinutes;
                            final hours = mins ~/ 60;
                            final minutes = mins % 60;
                            final summary = hours > 0
                                ? '$hours h $minutes m'
                                : '$minutes m';
                            if (!context.mounted) {
                              return;
                            }
                            ScaffoldMessenger.of(context).showSnackBar(
                              SnackBar(
                                content: Text(
                                  'Patrol without falcon stopped ($summary).',
                                ),
                              ),
                            );
                          } catch (error) {
                            if (!context.mounted) {
                              return;
                            }
                            ScaffoldMessenger.of(context).showSnackBar(
                              SnackBar(content: Text(error.toString())),
                            );
                          }
                        }
                      : null,
                  icon: const Icon(Icons.stop_circle),
                  label: const Text('Patrol without Falcon Stop'),
                ),
              ),
            ],
          ),
          if (activePatrol != null) ...[
            const SizedBox(height: 6),
            Text(
              'Patrol active since ${DateFormat('h:mm a').format(activePatrol.startAt)}',
              style: const TextStyle(
                fontSize: 12.5,
                fontWeight: FontWeight.w700,
                color: Color(0xFF0A2C5A),
              ),
            ),
          ],
          const SizedBox(height: 4),
          Text(
            'Patrol without falcon tracked: ${patrolTotalHours.toStringAsFixed(1)}h total · ${patrolTodayHours.toStringAsFixed(1)}h today',
            style: const TextStyle(
              fontSize: 12.5,
              fontWeight: FontWeight.w700,
              color: Color(0xFF0A2C5A),
            ),
          ),
          const SizedBox(height: 8),
          OutlinedButton.icon(
            onPressed: () {
              Navigator.of(context).push(
                MaterialPageRoute(
                  builder: (_) =>
                      BeforeBedScreen(controller: widget.controller),
                ),
              );
            },
            icon: const Icon(Icons.nightlight_round),
            label: const Text('Before Bed Checklist'),
          ),
          const SizedBox(height: 12),
          if (alerts.isNotEmpty)
            Card(
              color: const Color(0xFFC62828),
              child: Padding(
                padding: const EdgeInsets.all(12),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const SizedBox(
                      width: double.infinity,
                      child: Text(
                        'FALCON FEED ALERT',
                        textAlign: TextAlign.center,
                        style: TextStyle(
                          fontWeight: FontWeight.bold,
                          fontSize: 22,
                          color: Colors.white,
                        ),
                      ),
                    ),
                    const SizedBox(height: 10),
                    ...alerts.map((a) {
                      final foodStillNeeded = math.max(
                        0,
                        a.requiredGrams - a.actualGrams,
                      );
                      return Padding(
                        padding: const EdgeInsets.only(bottom: 12),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              a.falconName,
                              style: const TextStyle(
                                fontSize: 20,
                                color: Colors.black,
                                fontWeight: FontWeight.w800,
                                height: 1.15,
                              ),
                            ),
                            Text(
                              'Required ${a.requiredGrams.toStringAsFixed(1)}g',
                              style: const TextStyle(
                                fontSize: 12,
                                color: Colors.black,
                                fontWeight: FontWeight.w700,
                                height: 1.2,
                              ),
                            ),
                            const SizedBox(height: 3),
                            Text(
                              'Actual ${a.actualGrams.toStringAsFixed(1)}g',
                              style: const TextStyle(
                                fontSize: 13,
                                color: Colors.black,
                                fontWeight: FontWeight.w600,
                                height: 1.2,
                              ),
                            ),
                            const SizedBox(height: 6),
                            Text(
                              'FALCON STILL NEEDED ${foodStillNeeded.toStringAsFixed(1)}g',
                              style: const TextStyle(
                                fontSize: 13,
                                color: Colors.black,
                                fontWeight: FontWeight.w700,
                                height: 1.2,
                              ),
                            ),
                            const SizedBox(height: 8),
                            Row(
                              children: [
                                SizedBox(
                                  width: 92,
                                  child: TextField(
                                    controller: _supplementalControllerFor(
                                      a.falconId,
                                    ),
                                    keyboardType:
                                        const TextInputType.numberWithOptions(
                                          decimal: true,
                                        ),
                                    inputFormatters: [
                                      FilteringTextInputFormatter.allow(
                                        RegExp(r'^\d*\.?\d{0,1}'),
                                      ),
                                    ],
                                    decoration: const InputDecoration(
                                      isDense: true,
                                      hintText: 'grams',
                                      filled: true,
                                      fillColor: Colors.white,
                                      border: OutlineInputBorder(),
                                      contentPadding: EdgeInsets.symmetric(
                                        horizontal: 8,
                                        vertical: 8,
                                      ),
                                    ),
                                  ),
                                ),
                                const SizedBox(width: 8),
                                FilledButton(
                                  onPressed: () => _logSupplementalFeed(a),
                                  child: const Text('Log Fed'),
                                ),
                              ],
                            ),
                          ],
                        ),
                      );
                    }),
                    const SizedBox(height: 4),
                    const Text(
                      'Handler + admin notification routing should be completed by backend/web dashboard integration.',
                      style: TextStyle(fontSize: 12, color: Colors.white70),
                    ),
                  ],
                ),
              ),
            ),
          if (isAdmin) ...[
            const SizedBox(height: 12),
            const Text(
              'Flying Sessions for Today, Completed',
              style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16),
            ),
            const SizedBox(height: 8),
            ...widget.controller.currentUserSessions.map((session) {
              final falcon = widget.controller.falconById(session.falconId);
              final field = widget.controller.fieldById(session.fieldId);
              return Card(
                child: ListTile(
                  title: Text('${falcon.name} · ${field.name}'),
                  subtitle: Text(
                    '${_fmtDate(session.startAt)} · ${session.endAt == null ? 'Active' : 'Completed'}',
                  ),
                  trailing: const Icon(Icons.chevron_right),
                  onTap: () {
                    if (session.endAt == null) {
                      Navigator.of(context).push(
                        MaterialPageRoute(
                          builder: (_) => LiveSessionScreen(
                            controller: widget.controller,
                            sessionId: session.id,
                          ),
                        ),
                      );
                    } else {
                      Navigator.of(context).push(
                        MaterialPageRoute(
                          builder: (_) => SessionSummaryScreen(
                            controller: widget.controller,
                            sessionId: session.id,
                          ),
                        ),
                      );
                    }
                  },
                ),
              );
            }),
          ],
          const SizedBox(height: 12),
          OutlinedButton.icon(
            onPressed: () {
              Navigator.of(context).push(
                MaterialPageRoute(
                  builder: (_) => Scaffold(
                    appBar: AppBar(title: const Text('Local Weather')),
                    body: ListView(
                      padding: const EdgeInsets.all(12),
                      children: [
                        _localWeatherCard(detailed: true),
                        const SizedBox(height: 12),
                        _sevenDayForecastCard(),
                      ],
                    ),
                  ),
                ),
              );
            },
            icon: const Icon(Icons.cloud),
            label: const Text('Local Weather'),
          ),
          const SizedBox(height: 8),
          OutlinedButton.icon(
            onPressed: () {
              Navigator.of(context).push(
                MaterialPageRoute(
                  builder: (_) => StarlingActivityTimelineScreen(
                    controller: widget.controller,
                  ),
                ),
              );
            },
            icon: const Icon(Icons.timeline),
            label: const Text('Starling Activity Timeline'),
          ),
          const SizedBox(height: 8),
          OutlinedButton.icon(
            onPressed: () {
              Navigator.of(context).push(
                MaterialPageRoute(
                  builder: (_) =>
                      CustomerInputScreen(controller: widget.controller),
                ),
              );
            },
            icon: const SizedBox(
              width: 20,
              height: 20,
              child: Center(
                child: Text(
                  'CI',
                  style: TextStyle(fontWeight: FontWeight.w900, fontSize: 12),
                ),
              ),
            ),
            label: const Text('Customer Input'),
          ),
          const SizedBox(height: 8),
          OutlinedButton.icon(
            onPressed: () {
              Navigator.of(context).push(
                MaterialPageRoute(
                  builder: (_) =>
                      OtherInformationScreen(controller: widget.controller),
                ),
              );
            },
            icon: const Icon(Icons.info_outline),
            label: const Text('Other Information'),
          ),
          const SizedBox(height: 8),
        ],
      ),
    );
  }

  Future<void> _loadHomeWeather() async {
    if (mounted) {
      setState(() {
        _loadingHomeWeather = true;
        _homeWeatherError = null;
      });
    }

    try {
      final enabled = await Geolocator.isLocationServiceEnabled();
      if (!enabled) {
        throw StateError('Enable Location Services to load local weather.');
      }

      var permission = await Geolocator.checkPermission();
      if (permission == LocationPermission.denied) {
        permission = await Geolocator.requestPermission();
      }
      if (permission == LocationPermission.denied ||
          permission == LocationPermission.deniedForever) {
        throw StateError('Location permission is required for local weather.');
      }

      Position? position;
      try {
        position = await Geolocator.getCurrentPosition(
          locationSettings: const LocationSettings(
            accuracy: LocationAccuracy.low,
            timeLimit: Duration(seconds: 8),
          ),
        );
      } catch (_) {
        position = await Geolocator.getLastKnownPosition();
      }
      if (position == null) {
        throw StateError('Unable to read device GPS location.');
      }

      final uri = Uri.https('api.open-meteo.com', '/v1/forecast', {
        'latitude': position.latitude.toString(),
        'longitude': position.longitude.toString(),
        'current':
            'temperature_2m,relative_humidity_2m,wind_speed_10m,wind_direction_10m,cloud_cover,precipitation',
        'daily':
            'temperature_2m_max,temperature_2m_min,precipitation_probability_max',
        'forecast_days': '7',
        'temperature_unit': 'fahrenheit',
        'wind_speed_unit': 'mph',
        'timezone': 'auto',
      });

      final response = await http.get(uri);
      if (response.statusCode != 200) {
        throw StateError(
          'Weather service unavailable (${response.statusCode}).',
        );
      }

      final decoded = jsonDecode(response.body) as Map<String, dynamic>;
      final current = decoded['current'] as Map<String, dynamic>? ?? const {};
      final daily = decoded['daily'] as Map<String, dynamic>? ?? const {};
      final times =
          (daily['time'] as List<dynamic>?)?.whereType<String>().toList() ??
          const <String>[];
      final maxSeries =
          (daily['temperature_2m_max'] as List<dynamic>?)
              ?.whereType<num>()
              .toList() ??
          const <num>[];
      final minSeries =
          (daily['temperature_2m_min'] as List<dynamic>?)
              ?.whereType<num>()
              .toList() ??
          const <num>[];
      final rainSeries =
          (daily['precipitation_probability_max'] as List<dynamic>?)
              ?.whereType<num>()
              .toList() ??
          const <num>[];
      final sevenDayForecast = <_HomeForecastDay>[];
      for (var i = 0; i < times.length && i < 7; i += 1) {
        final parsedDate = DateTime.tryParse(times[i]);
        final label = parsedDate == null
            ? times[i]
            : DateFormat('EEE M/d').format(parsedDate).toUpperCase();
        sevenDayForecast.add(
          _HomeForecastDay(
            dayLabel: label,
            highF: i < maxSeries.length ? maxSeries[i].toDouble() : null,
            lowF: i < minSeries.length ? minSeries[i].toDouble() : null,
            rainPercent: i < rainSeries.length
                ? rainSeries[i].toDouble()
                : null,
          ),
        );
      }
      int? airQualityIndex;
      try {
        final aqiUri =
            Uri.https('air-quality-api.open-meteo.com', '/v1/air-quality', {
              'latitude': position.latitude.toString(),
              'longitude': position.longitude.toString(),
              'current': 'us_aqi',
              'timezone': 'auto',
            });
        final aqiResponse = await http.get(aqiUri);
        if (aqiResponse.statusCode == 200) {
          final aqiDecoded =
              jsonDecode(aqiResponse.body) as Map<String, dynamic>;
          final aqiCurrent =
              aqiDecoded['current'] as Map<String, dynamic>? ?? const {};
          airQualityIndex = (aqiCurrent['us_aqi'] as num?)?.round();
        }
      } catch (_) {}

      if (!mounted) {
        return;
      }
      setState(() {
        _homeTemperatureF = (current['temperature_2m'] as num?)?.toDouble();
        _homeHighTemperatureF = maxSeries.isEmpty
            ? null
            : maxSeries.first.toDouble();
        _homeLowTemperatureF = minSeries.isEmpty
            ? null
            : minSeries.first.toDouble();
        _homeHumidityPercent = (current['relative_humidity_2m'] as num?)
            ?.round();
        _homeWindMph = (current['wind_speed_10m'] as num?)?.toDouble();
        _homeWindDirectionDegrees = (current['wind_direction_10m'] as num?)
            ?.toDouble();
        _homeCloudCoverPercent = (current['cloud_cover'] as num?)?.round();
        _homePrecipitationMm = (current['precipitation'] as num?)?.toDouble();
        _homeAirQualityIndex = airQualityIndex;
        _homeSevenDayForecast = sevenDayForecast;
      });
    } catch (error) {
      if (!mounted) {
        return;
      }
      setState(() {
        _homeWeatherError = error.toString().replaceFirst('Bad state: ', '');
        _homeSevenDayForecast = const [];
      });
    } finally {
      if (mounted) {
        setState(() => _loadingHomeWeather = false);
      }
    }
  }

  Future<void> _showPendingAdminQuestionIfNeeded() async {
    if (!mounted || _checkingAdminQuestion || _adminQuestionDialogOpen) {
      return;
    }
    _checkingAdminQuestion = true;
    bool openedDialog = false;
    try {
      final user = widget.controller.currentUser;
      if (user == null || user.role != UserRole.handler) {
        return;
      }
      final route = ModalRoute.of(context);
      if (route?.isCurrent != true) {
        return;
      }
      final rootDialogContext = Navigator.of(
        context,
        rootNavigator: true,
      ).context;
      final pending = widget.controller.unresolvedAdminQuestionsForCurrentUser
          .where((item) => !_shownAdminQuestionIds.contains(item.id))
          .toList();
      if (pending.isEmpty) {
        return;
      }
      final question = pending.first;
      _shownAdminQuestionIds.add(question.id);

      final answerController = TextEditingController();
      try {
        if (!mounted) {
          return;
        }
        _adminQuestionDialogOpen = true;
        openedDialog = true;
        await showDialog<void>(
          context: rootDialogContext,
          useRootNavigator: true,
          barrierDismissible: false,
          builder: (dialogContext) {
            String? errorText;
            return StatefulBuilder(
              builder: (dialogContext, setDialogState) {
                return AlertDialog(
                  title: const Text('Admin Question'),
                  content: Column(
                    mainAxisSize: MainAxisSize.min,
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        question.questionText,
                        style: const TextStyle(
                          fontSize: 15,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                      const SizedBox(height: 12),
                      TextField(
                        controller: answerController,
                        maxLines: 3,
                        decoration: const InputDecoration(
                          labelText: 'Type your answer',
                        ),
                      ),
                      if (errorText != null) ...[
                        const SizedBox(height: 8),
                        Text(
                          errorText!,
                          style: const TextStyle(
                            color: Color(0xFFB91C1C),
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      ],
                    ],
                  ),
                  actions: [
                    FilledButton(
                      onPressed: () async {
                        final answer = answerController.text.trim();
                        if (answer.isEmpty) {
                          setDialogState(
                            () => errorText = 'Answer is required.',
                          );
                          return;
                        }
                        try {
                          await widget.controller.answerAdminQuestion(
                            questionId: question.id,
                            answerText: answer,
                          );
                          if (dialogContext.mounted) {
                            Navigator.of(dialogContext).pop();
                          }
                        } catch (error) {
                          setDialogState(() => errorText = error.toString());
                        }
                      },
                      child: const Text('Submit Answer'),
                    ),
                  ],
                );
              },
            );
          },
        );
      } finally {
        answerController.dispose();
      }
    } finally {
      _checkingAdminQuestion = false;
      if (openedDialog) {
        _adminQuestionDialogOpen = false;
      }
    }
  }

  Widget _localWeatherCard({bool detailed = false}) {
    final titleSize = detailed ? 22.0 : 13.0;
    final bodySize = detailed ? 17.0 : 10.0;
    final conditionSize = detailed ? 16.0 : 10.0;
    return Card(
      color: const Color(0xFFE7F5E8),
      child: Padding(
        padding: EdgeInsets.all(detailed ? 12 : 5),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Local Weather',
              style: TextStyle(
                fontSize: titleSize,
                fontWeight: FontWeight.w800,
                fontStyle: FontStyle.italic,
                color: Color(0xFF1F2937),
              ),
            ),
            SizedBox(height: detailed ? 8 : 2),
            if (_loadingHomeWeather)
              Text(
                'Loading local weather...',
                style: TextStyle(
                  fontSize: bodySize,
                  fontWeight: FontWeight.w600,
                  color: Color(0xFF1F2937),
                ),
              )
            else if (_homeWeatherError != null)
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    _homeWeatherError!,
                    style: TextStyle(
                      fontSize: detailed ? 14 : 10,
                      fontWeight: FontWeight.w600,
                      color: Color(0xFF842029),
                    ),
                  ),
                  const SizedBox(height: 2),
                  TextButton(
                    onPressed: _loadHomeWeather,
                    child: Text(
                      'Retry',
                      style: TextStyle(fontSize: detailed ? 15 : 12),
                    ),
                  ),
                ],
              )
            else
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Expanded(
                    flex: 3,
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        _homeWeatherRow(
                          'High/Low',
                          (_homeHighTemperatureF == null ||
                                  _homeLowTemperatureF == null)
                              ? '--'
                              : '${_homeHighTemperatureF!.round()} / ${_homeLowTemperatureF!.round()} F',
                          fontSize: bodySize,
                        ),
                        _homeWeatherRow(
                          'Temperature',
                          _homeTemperatureF == null
                              ? '--'
                              : '${_homeTemperatureF!.round()} F',
                          fontSize: bodySize,
                        ),
                        _homeWeatherRow(
                          'Wind Speed',
                          _homeWindMph == null
                              ? '--'
                              : '${_homeWindMph!.round()} mph',
                          fontSize: bodySize,
                        ),
                        _homeWeatherRow(
                          'Wind Direction',
                          _homeWindDirectionDegrees == null
                              ? '--'
                              : _windDirectionLabel(_homeWindDirectionDegrees),
                          fontSize: bodySize,
                        ),
                        _homeWeatherRow(
                          'Humidity',
                          _homeHumidityPercent == null
                              ? '--'
                              : '${_homeHumidityPercent!}%',
                          fontSize: bodySize,
                        ),
                      ],
                    ),
                  ),
                  SizedBox(width: detailed ? 8 : 5),
                  Expanded(
                    flex: 2,
                    child: Container(
                      padding: EdgeInsets.symmetric(
                        horizontal: detailed ? 10 : 6,
                        vertical: detailed ? 8 : 5,
                      ),
                      decoration: BoxDecoration(
                        color: const Color(0xFFDFF0DF),
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            children: [
                              Icon(
                                _homeConditionIcon(),
                                size: detailed ? 20 : 13,
                                color: _homeConditionColor(),
                              ),
                              const SizedBox(width: 4),
                              Expanded(
                                child: Text(
                                  'Condition: ${_homeConditionLabel()}',
                                  style: TextStyle(
                                    fontSize: conditionSize,
                                    fontWeight: FontWeight.w700,
                                    color: Color(0xFF1F2937),
                                  ),
                                ),
                              ),
                            ],
                          ),
                          SizedBox(height: detailed ? 6 : 1),
                          Text(
                            'AQI: ${_homeAirQualityIndex ?? '--'}',
                            style: TextStyle(
                              fontSize: conditionSize,
                              fontWeight: FontWeight.w700,
                              color: Color(0xFF1F2937),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ],
              ),
          ],
        ),
      ),
    );
  }

  Widget _sevenDayForecastCard() {
    return Card(
      color: const Color(0xFFE8F0FF),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              '7-Day Forecast',
              style: TextStyle(fontSize: 22, fontWeight: FontWeight.w800),
            ),
            const SizedBox(height: 8),
            if (_homeSevenDayForecast.isEmpty)
              const Text(
                'Forecast unavailable.',
                style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
              )
            else
              ..._homeSevenDayForecast.map(
                (day) => Padding(
                  padding: const EdgeInsets.only(bottom: 6),
                  child: Row(
                    children: [
                      SizedBox(
                        width: 92,
                        child: Text(
                          day.dayLabel,
                          style: const TextStyle(
                            fontSize: 16,
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                      ),
                      Expanded(
                        child: Text(
                          'High ${day.highF?.round() ?? '--'} F / Low ${day.lowF?.round() ?? '--'} F',
                          style: const TextStyle(
                            fontSize: 15,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      ),
                      SizedBox(
                        width: 72,
                        child: Text(
                          'Rain ${day.rainPercent?.round() ?? '--'}%',
                          textAlign: TextAlign.right,
                          style: const TextStyle(
                            fontSize: 14,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }

  Widget _homeWeatherRow(String label, String value, {double fontSize = 10}) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 1),
      child: Text(
        '$label: $value',
        textAlign: TextAlign.left,
        style: TextStyle(
          fontSize: fontSize,
          fontWeight: FontWeight.w700,
          color: Color(0xFF1F2937),
        ),
      ),
    );
  }

  String _windDirectionLabel(double? degrees) {
    if (degrees == null) {
      return '--';
    }
    const labels = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW', 'N'];
    final normalized = degrees % 360;
    final index = (normalized / 45).round();
    return labels[index];
  }

  bool _isRainyHomeWeather() {
    return (_homePrecipitationMm ?? 0) > 0;
  }

  bool _isCloudyHomeWeather() {
    return (_homeCloudCoverPercent ?? 0) >= 50;
  }

  bool _isSunnyHomeWeather() {
    return !_isRainyHomeWeather() &&
        (_homeCloudCoverPercent != null && _homeCloudCoverPercent! < 35);
  }

  String _homeConditionLabel() {
    if (_isRainyHomeWeather()) {
      return 'Rainy';
    }
    if (_isCloudyHomeWeather()) {
      return 'Cloudy';
    }
    if (_isSunnyHomeWeather()) {
      return 'Sunny';
    }
    return 'Partly Cloudy';
  }

  IconData _homeConditionIcon() {
    if (_isRainyHomeWeather()) {
      return Icons.grain;
    }
    if (_isCloudyHomeWeather()) {
      return Icons.cloud;
    }
    if (_isSunnyHomeWeather()) {
      return Icons.wb_sunny;
    }
    return Icons.cloud_queue;
  }

  Color _homeConditionColor() {
    if (_isRainyHomeWeather()) {
      return const Color(0xFF1D4ED8);
    }
    if (_isCloudyHomeWeather()) {
      return const Color(0xFF4B5563);
    }
    if (_isSunnyHomeWeather()) {
      return const Color(0xFFF59E0B);
    }
    return const Color(0xFF6B7280);
  }

  TextEditingController _supplementalControllerFor(String falconId) {
    return _supplementalFeedControllers.putIfAbsent(
      falconId,
      TextEditingController.new,
    );
  }

  Future<void> _logSupplementalFeed(FeedComplianceAlert alert) async {
    final controller = _supplementalControllerFor(alert.falconId);
    final value = double.tryParse(controller.text.trim());
    if (value == null || value <= 0) {
      if (!mounted) {
        return;
      }
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Enter grams fed (greater than 0).')),
      );
      return;
    }

    try {
      await widget.controller.addSupplementalFeedGrams(
        falconId: alert.falconId,
        grams: value,
      );
      controller.clear();
      if (!mounted) {
        return;
      }
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            'Logged ${value.toStringAsFixed(1)}g for ${alert.falconName}. Daily calories updated.',
          ),
        ),
      );
    } catch (error) {
      if (!mounted) {
        return;
      }
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(error.toString().replaceFirst('Bad state: ', '')),
        ),
      );
    }
  }
}

class _PeregrineFalconHeroCard extends StatelessWidget {
  const _PeregrineFalconHeroCard();

  @override
  Widget build(BuildContext context) {
    return Card(
      clipBehavior: Clip.antiAlias,
      elevation: 1.5,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      child: Container(
        height: 280,
        width: double.infinity,
        color: const Color(0xFFF4F8FF),
        child: Image.asset(
          'assets/images/peregrine_falcon.jpg',
          fit: BoxFit.cover,
          errorBuilder: (_, _, _) =>
              CustomPaint(painter: _PeregrineFalconPainter()),
        ),
      ),
    );
  }
}

class _PeregrineFalconPainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final rect = Offset.zero & size;
    final bg = Paint()
      ..shader = const LinearGradient(
        begin: Alignment.topCenter,
        end: Alignment.bottomCenter,
        colors: [Color(0xFFEAF3FF), Color(0xFFFDFEFF)],
      ).createShader(rect);
    canvas.drawRect(rect, bg);

    final cx = size.width / 2;
    final topY = size.height * 0.12;
    final headBottomY = size.height * 0.88;

    final head = ui.Path()
      ..moveTo(cx, topY)
      ..cubicTo(
        cx - size.width * 0.26,
        topY + size.height * 0.08,
        cx - size.width * 0.30,
        headBottomY - size.height * 0.18,
        cx,
        headBottomY,
      )
      ..cubicTo(
        cx + size.width * 0.30,
        headBottomY - size.height * 0.18,
        cx + size.width * 0.26,
        topY + size.height * 0.08,
        cx,
        topY,
      )
      ..close();
    canvas.drawPath(head, Paint()..color = const Color(0xFF313A46));

    final whiteMask = ui.Path()
      ..moveTo(cx, topY + size.height * 0.12)
      ..cubicTo(
        cx - size.width * 0.19,
        topY + size.height * 0.20,
        cx - size.width * 0.20,
        headBottomY - size.height * 0.26,
        cx,
        headBottomY - size.height * 0.05,
      )
      ..cubicTo(
        cx + size.width * 0.20,
        headBottomY - size.height * 0.26,
        cx + size.width * 0.19,
        topY + size.height * 0.20,
        cx,
        topY + size.height * 0.12,
      )
      ..close();
    canvas.drawPath(whiteMask, Paint()..color = const Color(0xFFF3F4F6));

    final stripePaint = Paint()..color = const Color(0xFF1D232B);
    final leftStripe = ui.Path()
      ..moveTo(cx - size.width * 0.06, size.height * 0.38)
      ..cubicTo(
        cx - size.width * 0.12,
        size.height * 0.42,
        cx - size.width * 0.13,
        size.height * 0.60,
        cx - size.width * 0.05,
        size.height * 0.69,
      )
      ..lineTo(cx - size.width * 0.01, size.height * 0.63)
      ..cubicTo(
        cx - size.width * 0.05,
        size.height * 0.56,
        cx - size.width * 0.05,
        size.height * 0.46,
        cx - size.width * 0.01,
        size.height * 0.40,
      )
      ..close();
    final rightStripe = ui.Path()
      ..moveTo(cx + size.width * 0.06, size.height * 0.38)
      ..cubicTo(
        cx + size.width * 0.12,
        size.height * 0.42,
        cx + size.width * 0.13,
        size.height * 0.60,
        cx + size.width * 0.05,
        size.height * 0.69,
      )
      ..lineTo(cx + size.width * 0.01, size.height * 0.63)
      ..cubicTo(
        cx + size.width * 0.05,
        size.height * 0.56,
        cx + size.width * 0.05,
        size.height * 0.46,
        cx + size.width * 0.01,
        size.height * 0.40,
      )
      ..close();
    canvas.drawPath(leftStripe, stripePaint);
    canvas.drawPath(rightStripe, stripePaint);

    final eyeWhitePaint = Paint()..color = Colors.white;
    canvas.drawOval(
      Rect.fromCenter(
        center: Offset(cx - size.width * 0.085, size.height * 0.36),
        width: size.width * 0.11,
        height: size.height * 0.07,
      ),
      eyeWhitePaint,
    );
    canvas.drawOval(
      Rect.fromCenter(
        center: Offset(cx + size.width * 0.085, size.height * 0.36),
        width: size.width * 0.11,
        height: size.height * 0.07,
      ),
      eyeWhitePaint,
    );

    final irisPaint = Paint()..color = const Color(0xFF0B1320);
    canvas.drawCircle(
      Offset(cx - size.width * 0.085, size.height * 0.36),
      size.width * 0.02,
      irisPaint,
    );
    canvas.drawCircle(
      Offset(cx + size.width * 0.085, size.height * 0.36),
      size.width * 0.02,
      irisPaint,
    );

    final beakTop = ui.Path()
      ..moveTo(cx, size.height * 0.43)
      ..lineTo(cx - size.width * 0.055, size.height * 0.56)
      ..quadraticBezierTo(
        cx,
        size.height * 0.61,
        cx + size.width * 0.055,
        size.height * 0.56,
      )
      ..close();
    canvas.drawPath(beakTop, Paint()..color = const Color(0xFFF3B24C));

    final beakTip = ui.Path()
      ..moveTo(cx - size.width * 0.02, size.height * 0.56)
      ..quadraticBezierTo(
        cx,
        size.height * 0.63,
        cx + size.width * 0.02,
        size.height * 0.56,
      )
      ..close();
    canvas.drawPath(beakTip, Paint()..color = const Color(0xFFBE7F1A));
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}

class OtherInformationScreen extends StatelessWidget {
  const OtherInformationScreen({super.key, required this.controller});

  final FalconAppController controller;

  @override
  Widget build(BuildContext context) {
    final isAdmin = controller.currentUser?.role == UserRole.manager;
    return Scaffold(
      appBar: AppBar(title: const Text('Other Information')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          OutlinedButton.icon(
            onPressed: () {
              Navigator.of(context).push(
                MaterialPageRoute(builder: (_) => const DailyScheduleScreen()),
              );
            },
            icon: const Icon(Icons.schedule),
            label: const Text('Daily Schedule'),
          ),
          const SizedBox(height: 8),
          OutlinedButton.icon(
            onPressed: () {
              Navigator.of(context).push(
                MaterialPageRoute(
                  builder: (_) => const GeneralStarlingWorkPatternScreen(),
                ),
              );
            },
            icon: const Icon(Icons.fact_check),
            label: const Text('General Starling and Work Pattern'),
          ),
          const SizedBox(height: 8),
          OutlinedButton.icon(
            onPressed: () {
              Navigator.of(context).push(
                MaterialPageRoute(
                  builder: (_) => const WeeklyWorkScheduleScreen(),
                ),
              );
            },
            icon: const Icon(Icons.view_week),
            label: const Text('Weekly Work Schedule'),
          ),
          const SizedBox(height: 8),
          OutlinedButton.icon(
            onPressed: () {
              Navigator.of(context).push(
                MaterialPageRoute(builder: (_) => const WorkProtocolScreen()),
              );
            },
            icon: const Icon(Icons.rule),
            label: const Text('Work Protocol'),
          ),
          const SizedBox(height: 8),
          OutlinedButton.icon(
            onPressed: () {
              Navigator.of(context).push(
                MaterialPageRoute(
                  builder: (_) => const SiteInformationScreen(),
                ),
              );
            },
            icon: const Icon(Icons.location_city),
            label: const Text('Site Information'),
          ),
          const SizedBox(height: 8),
          OutlinedButton.icon(
            onPressed: () {
              Navigator.of(context).push(
                MaterialPageRoute(
                  builder: (_) => const ContactInformationScreen(),
                ),
              );
            },
            icon: const Icon(Icons.contact_phone),
            label: const Text('Contact Information'),
          ),
          const SizedBox(height: 8),
          OutlinedButton.icon(
            onPressed: () {
              Navigator.of(context).push(
                MaterialPageRoute(
                  builder: (_) => const FalconEquipmentScreen(),
                ),
              );
            },
            icon: const Icon(Icons.checklist_rtl),
            label: const Text('Equipment List'),
          ),
          const SizedBox(height: 8),
          OutlinedButton.icon(
            onPressed: () {
              Navigator.of(context).push(
                MaterialPageRoute(
                  builder: (_) =>
                      FalconHandlerMetricsScreen(controller: controller),
                ),
              );
            },
            icon: const Icon(Icons.query_stats),
            label: const Text('Falcon Handler Metrics'),
          ),
          const SizedBox(height: 8),
          OutlinedButton.icon(
            onPressed: () {
              Navigator.of(context).push(
                MaterialPageRoute(
                  builder: (_) =>
                      PatrolWithoutFalconSummaryScreen(controller: controller),
                ),
              );
            },
            icon: const Icon(Icons.directions_bike),
            label: const Text('Patrol Without Falcon Time'),
          ),
          if (isAdmin) ...[
            const SizedBox(height: 8),
            OutlinedButton.icon(
              onPressed: () {
                Navigator.of(context).push(
                  MaterialPageRoute(
                    builder: (_) =>
                        AdminFalconLogsScreen(controller: controller),
                  ),
                );
              },
              icon: const Icon(Icons.table_chart),
              label: const Text('Admin Falcon Logs'),
            ),
          ],
        ],
      ),
    );
  }
}

class FalconHandlerMetricsScreen extends StatelessWidget {
  const FalconHandlerMetricsScreen({super.key, required this.controller});

  final FalconAppController controller;

  @override
  Widget build(BuildContext context) {
    final sessions = controller.currentUserSessions;
    final totalFlyingMinutes = sessions.fold<double>(
      0,
      (sum, session) => sum + controller.flyingMinutes(session),
    );
    final totalFlyingHours = totalFlyingMinutes / 60;
    final patrolHours = controller.totalPatrolWithoutFalconMinutes() / 60;

    return Scaffold(
      appBar: AppBar(title: const Text('Falcon Handler Metrics')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          const Text(
            'Handler metrics',
            style: TextStyle(fontWeight: FontWeight.w800, fontSize: 20),
          ),
          const SizedBox(height: 10),
          Card(
            color: const Color(0xFFEAF5E4),
            child: ListTile(
              title: const Text(
                'Total Flight Hours',
                style: TextStyle(fontWeight: FontWeight.w800),
              ),
              subtitle: const Text(
                'First metric moved from the front page. More metrics can be added here.',
              ),
              trailing: Text(
                '${totalFlyingHours.toStringAsFixed(1)}h',
                style: const TextStyle(
                  fontSize: 24,
                  fontWeight: FontWeight.w800,
                  color: Color(0xFF1E5E2D),
                ),
              ),
            ),
          ),
          const SizedBox(height: 10),
          Card(
            color: const Color(0xFFE8F0FF),
            child: ListTile(
              title: const Text(
                'Patrol Without Falcon Hours',
                style: TextStyle(fontWeight: FontWeight.w800),
              ),
              subtitle: const Text(
                'Tracked from Patrol without Falcon Start/Stop.',
              ),
              trailing: Text(
                '${patrolHours.toStringAsFixed(1)}h',
                style: const TextStyle(
                  fontSize: 24,
                  fontWeight: FontWeight.w800,
                  color: Color(0xFF0D47A1),
                ),
              ),
            ),
          ),
          const SizedBox(height: 10),
          OutlinedButton.icon(
            onPressed: () {
              Navigator.of(context).push(
                MaterialPageRoute(
                  builder: (_) =>
                      FlightHoursSummaryScreen(controller: controller),
                ),
              );
            },
            icon: const Icon(Icons.calendar_month),
            label: const Text('Open Flight Hours Detail'),
          ),
        ],
      ),
    );
  }
}

enum _StarlingWindow { last5Days, last10Days, last15Days }

class StarlingActivityTimelineScreen extends StatefulWidget {
  const StarlingActivityTimelineScreen({super.key, required this.controller});

  final FalconAppController controller;

  @override
  State<StarlingActivityTimelineScreen> createState() =>
      _StarlingActivityTimelineScreenState();
}

class _StarlingActivityTimelineScreenState
    extends State<StarlingActivityTimelineScreen> {
  _StarlingWindow _selectedWindow = _StarlingWindow.last5Days;

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: widget.controller,
      builder: (context, _) {
        final now = DateTime.now();
        final startOfToday = DateTime(now.year, now.month, now.day);
        final startOfLast5Day = startOfToday.subtract(const Duration(days: 4));
        final startOfLast10Day = startOfToday.subtract(const Duration(days: 9));
        final startOfLast15Day = startOfToday.subtract(
          const Duration(days: 14),
        );
        final selectedEvents = switch (_selectedWindow) {
          _StarlingWindow.last5Days => _starlingEventsSince(startOfLast5Day),
          _StarlingWindow.last10Days => _starlingEventsSince(startOfLast10Day),
          _StarlingWindow.last15Days => _starlingEventsSince(startOfLast15Day),
        };
        final buckets = _hourBuckets(selectedEvents);
        final maxBucket = buckets.fold<int>(
          1,
          (maxValue, item) => item.taps > maxValue ? item.taps : maxValue,
        );

        return Scaffold(
          appBar: AppBar(title: const Text('Starling Activity Timeline')),
          body: ListView(
            padding: const EdgeInsets.all(16),
            children: [
              const Text(
                'Track starling activity by time of day to see when flocks are arriving.',
                style: TextStyle(fontSize: 12, color: Colors.black54),
              ),
              const SizedBox(height: 10),
              SegmentedButton<_StarlingWindow>(
                segments: const [
                  ButtonSegment(
                    value: _StarlingWindow.last5Days,
                    label: Text('Last 5 Days'),
                  ),
                  ButtonSegment(
                    value: _StarlingWindow.last10Days,
                    label: Text('Last 10 Days'),
                  ),
                  ButtonSegment(
                    value: _StarlingWindow.last15Days,
                    label: Text('Last 15 Days'),
                  ),
                ],
                selected: {_selectedWindow},
                onSelectionChanged: (selection) {
                  setState(() => _selectedWindow = selection.first);
                },
                showSelectedIcon: false,
              ),
              const SizedBox(height: 10),
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(12),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        '${_windowLabel(_selectedWindow)} Pattern Map (4 AM - 8 PM)',
                        style: const TextStyle(
                          fontWeight: FontWeight.w800,
                          fontSize: 15,
                        ),
                      ),
                      const SizedBox(height: 8),
                      if (selectedEvents.isEmpty)
                        Text(
                          'No starling activity recorded for ${_windowLabel(_selectedWindow).toLowerCase()}.',
                          style: TextStyle(fontSize: 12, color: Colors.black54),
                        )
                      else
                        ...buckets.map((bucket) {
                          final ratio = bucket.taps == 0
                              ? 0.0
                              : bucket.taps / maxBucket;
                          return Padding(
                            padding: const EdgeInsets.only(bottom: 6),
                            child: Row(
                              children: [
                                SizedBox(
                                  width: 64,
                                  child: Text(
                                    _hourLabel(bucket.hour),
                                    style: const TextStyle(
                                      fontSize: 12,
                                      fontWeight: FontWeight.w700,
                                    ),
                                  ),
                                ),
                                Expanded(
                                  child: ClipRRect(
                                    borderRadius: BorderRadius.circular(8),
                                    child: LinearProgressIndicator(
                                      value: ratio,
                                      minHeight: 10,
                                      color: kEntryBlueDark,
                                      backgroundColor: const Color(0xFFE2E8F0),
                                    ),
                                  ),
                                ),
                                const SizedBox(width: 8),
                                SizedBox(
                                  width: 92,
                                  child: Text(
                                    '${bucket.taps} taps · ${bucket.birds}',
                                    textAlign: TextAlign.right,
                                    style: const TextStyle(
                                      fontSize: 11,
                                      fontWeight: FontWeight.w700,
                                    ),
                                  ),
                                ),
                              ],
                            ),
                          );
                        }),
                    ],
                  ),
                ),
              ),
            ],
          ),
        );
      },
    );
  }

  List<SessionEvent> _starlingEventsSince(DateTime startInclusive) {
    final events = <SessionEvent>[];
    for (final session in widget.controller.currentUserSessions) {
      for (final event in session.events) {
        if (event.type == SessionEventType.starling &&
            !event.at.isBefore(startInclusive)) {
          events.add(event);
        }
      }
    }
    events.sort((a, b) => a.at.compareTo(b.at));
    return events;
  }

  List<_HourBucket> _hourBuckets(List<SessionEvent> events) {
    const startHour = 4;
    const endHour = 20;
    final buckets = List<_HourBucket>.generate(
      endHour - startHour + 1,
      (index) => _HourBucket(hour: startHour + index, taps: 0, birds: 0),
    );
    for (final event in events) {
      final hour = event.at.hour;
      if (hour < startHour || hour > endHour) {
        continue;
      }
      final bucketIndex = hour - startHour;
      final existing = buckets[bucketIndex];
      buckets[bucketIndex] = _HourBucket(
        hour: hour,
        taps: existing.taps + 1,
        birds: existing.birds + (event.starlingCount ?? 0),
      );
    }
    return buckets;
  }

  String _windowLabel(_StarlingWindow window) {
    switch (window) {
      case _StarlingWindow.last5Days:
        return 'Last 5 Days';
      case _StarlingWindow.last10Days:
        return 'Last 10 Days';
      case _StarlingWindow.last15Days:
        return 'Last 15 Days';
    }
  }

  String _hourLabel(int hour) {
    final hourDate = DateTime(2000, 1, 1, hour);
    return DateFormat('h a').format(hourDate);
  }
}

class _HourBucket {
  const _HourBucket({
    required this.hour,
    required this.taps,
    required this.birds,
  });

  final int hour;
  final int taps;
  final int birds;
}

class _EquipmentSectionDef {
  const _EquipmentSectionDef({required this.title, required this.items});

  final String title;
  final List<_EquipmentItemDef> items;
}

class _EquipmentItemDef {
  const _EquipmentItemDef({required this.name, required this.quantity});

  final String name;
  final String quantity;
}

class FalconEquipmentScreen extends StatefulWidget {
  const FalconEquipmentScreen({super.key});

  @override
  State<FalconEquipmentScreen> createState() => _FalconEquipmentScreenState();
}

class _FalconEquipmentScreenState extends State<FalconEquipmentScreen> {
  static const List<_EquipmentSectionDef> _sections = [
    _EquipmentSectionDef(
      title: 'Falcon',
      items: [
        _EquipmentItemDef(name: 'Falcon spray bottle', quantity: '3'),
        _EquipmentItemDef(name: 'Water dishes', quantity: '2'),
        _EquipmentItemDef(name: 'Soap', quantity: '1'),
        _EquipmentItemDef(name: 'Black rubber dishes', quantity: '2'),
        _EquipmentItemDef(name: 'Quail shears', quantity: '2'),
        _EquipmentItemDef(name: 'Gloves', quantity: '3'),
        _EquipmentItemDef(name: 'Hood', quantity: '3'),
        _EquipmentItemDef(name: 'Jesses', quantity: '3'),
        _EquipmentItemDef(name: 'Leashes', quantity: '4'),
        _EquipmentItemDef(name: 'Whistles', quantity: '2'),
        _EquipmentItemDef(name: 'Bags', quantity: '2'),
        _EquipmentItemDef(name: 'Creance', quantity: '1'),
        _EquipmentItemDef(name: 'Lure', quantity: '2'),
        _EquipmentItemDef(name: 'Binoculars', quantity: '1'),
        _EquipmentItemDef(name: 'Portable perch', quantity: '1'),
        _EquipmentItemDef(name: 'Portable mat', quantity: '1'),
        _EquipmentItemDef(name: 'Spare anklets', quantity: '2'),
        _EquipmentItemDef(name: 'Scale', quantity: '2'),
        _EquipmentItemDef(name: 'Scale perch', quantity: '2'),
        _EquipmentItemDef(name: 'Water bottle holder ATV', quantity: '1'),
        _EquipmentItemDef(name: 'Quail in freezer', quantity: 'Variable'),
        _EquipmentItemDef(name: 'Rangle', quantity: '1'),
        _EquipmentItemDef(name: 'Rags', quantity: '2'),
      ],
    ),
    _EquipmentSectionDef(
      title: 'Falcon Specialist',
      items: [
        _EquipmentItemDef(name: 'Phone and charger', quantity: '1'),
        _EquipmentItemDef(name: 'Shirts, long sleeve', quantity: '4'),
        _EquipmentItemDef(name: 'Shirts, short sleeve', quantity: '2'),
        _EquipmentItemDef(name: 'Pants', quantity: '6'),
        _EquipmentItemDef(name: 'Jacket', quantity: '1'),
        _EquipmentItemDef(name: 'Rain top', quantity: '1'),
        _EquipmentItemDef(name: 'Rain bottom', quantity: '1'),
        _EquipmentItemDef(name: 'Helmet', quantity: '1'),
        _EquipmentItemDef(name: 'Insulative vest', quantity: '1'),
        _EquipmentItemDef(name: 'Gloves', quantity: '1'),
        _EquipmentItemDef(name: 'Wraparound glasses', quantity: '1'),
        _EquipmentItemDef(name: 'Sunguard', quantity: '1'),
        _EquipmentItemDef(name: 'Aspirin', quantity: '1'),
        _EquipmentItemDef(name: 'Allergy medicine', quantity: '1'),
        _EquipmentItemDef(name: 'First aid kit', quantity: '1'),
      ],
    ),
    _EquipmentSectionDef(
      title: 'ATV',
      items: [
        _EquipmentItemDef(name: 'ATV', quantity: '1'),
        _EquipmentItemDef(name: 'ATV ramps', quantity: '1'),
        _EquipmentItemDef(name: 'ATV straps', quantity: '2'),
        _EquipmentItemDef(name: 'Tire repair tool kit', quantity: '1'),
        _EquipmentItemDef(name: 'Tire repair plugs', quantity: '2'),
        _EquipmentItemDef(name: 'Slime bottle', quantity: '1'),
        _EquipmentItemDef(name: 'Oil change kit', quantity: '2'),
        _EquipmentItemDef(name: 'Hood holster', quantity: '1'),
        _EquipmentItemDef(name: 'Air compressor', quantity: '1'),
        _EquipmentItemDef(
          name: 'Spare key (strapped to ATV inside lid)',
          quantity: '1',
        ),
        _EquipmentItemDef(name: 'Tools for oil change', quantity: '1'),
        _EquipmentItemDef(name: 'Oil pan', quantity: '1'),
        _EquipmentItemDef(name: 'Receptacle', quantity: '1'),
        _EquipmentItemDef(name: 'Box secured to ATV', quantity: 'Check'),
        _EquipmentItemDef(name: 'Omni antenna on', quantity: 'Check'),
      ],
    ),
    _EquipmentSectionDef(
      title: 'RV',
      items: [
        _EquipmentItemDef(name: 'Sewer hose', quantity: '1'),
        _EquipmentItemDef(name: 'Water hose', quantity: '1'),
        _EquipmentItemDef(name: 'Chemical for toilet', quantity: '1'),
        _EquipmentItemDef(name: 'Toilet paper (RV specific)', quantity: '1'),
        _EquipmentItemDef(name: 'Propane tanks filled', quantity: '2'),
        _EquipmentItemDef(name: 'Tires pumped', quantity: 'Check'),
        _EquipmentItemDef(name: 'Spare tire pumped up', quantity: 'Check'),
        _EquipmentItemDef(name: 'Electrical cords', quantity: '1'),
      ],
    ),
    _EquipmentSectionDef(
      title: 'Living Items Inside Trailer',
      items: [
        _EquipmentItemDef(name: 'Pots and pans', quantity: '1'),
        _EquipmentItemDef(name: 'Utensils', quantity: '1'),
        _EquipmentItemDef(name: 'Glasses and mugs', quantity: '1'),
        _EquipmentItemDef(name: 'Dish soap', quantity: '1'),
        _EquipmentItemDef(name: 'Dish towels', quantity: '1'),
        _EquipmentItemDef(name: 'Towels', quantity: '1'),
        _EquipmentItemDef(name: 'Propane and stove', quantity: '1'),
        _EquipmentItemDef(name: 'Pillow', quantity: '1'),
        _EquipmentItemDef(name: 'Mattress', quantity: '1'),
        _EquipmentItemDef(name: 'Sheets', quantity: '1'),
        _EquipmentItemDef(name: 'Toiletries', quantity: '1'),
        _EquipmentItemDef(name: 'Bath towels', quantity: '1'),
        _EquipmentItemDef(name: 'Bag for dirty clothes', quantity: '1'),
        _EquipmentItemDef(name: 'Laundry detergent', quantity: '1'),
        _EquipmentItemDef(name: 'Quarters for laundromat', quantity: '1'),
        _EquipmentItemDef(name: 'Vacuum', quantity: '1'),
        _EquipmentItemDef(name: 'Cleaning rags', quantity: '1'),
        _EquipmentItemDef(name: 'Groceries', quantity: '1'),
        _EquipmentItemDef(name: 'Spices', quantity: '1'),
        _EquipmentItemDef(name: 'Cooking oils', quantity: '1'),
        _EquipmentItemDef(name: 'Plastic bags', quantity: '1'),
        _EquipmentItemDef(name: 'Tin foil', quantity: '1'),
        _EquipmentItemDef(name: 'Small barbecue and propane', quantity: '1'),
        _EquipmentItemDef(name: 'Paper plates', quantity: '1'),
        _EquipmentItemDef(name: 'Plastic trash bags', quantity: '1'),
        _EquipmentItemDef(name: 'Crockpot', quantity: '1'),
        _EquipmentItemDef(name: 'Coffeemaker', quantity: '1'),
        _EquipmentItemDef(name: 'Coffee filters', quantity: '1'),
        _EquipmentItemDef(name: 'Electrolyte drinks', quantity: '1'),
        _EquipmentItemDef(name: 'Water bottle', quantity: '1'),
      ],
    ),
  ];

  static const List<_EquipmentItemDef> _falconTelemetryItems = [
    _EquipmentItemDef(name: 'Magnets', quantity: '2'),
    _EquipmentItemDef(name: 'PocketLink', quantity: '1'),
    _EquipmentItemDef(name: 'AAA batteries', quantity: '12'),
    _EquipmentItemDef(name: 'AA batteries', quantity: '2'),
    _EquipmentItemDef(name: '9-volt batteries', quantity: '2'),
    _EquipmentItemDef(name: 'Transmitter batteries', quantity: 'Variable'),
    _EquipmentItemDef(name: 'Rechargeable batteries', quantity: '4'),
    _EquipmentItemDef(name: 'Wire cutters', quantity: '2'),
    _EquipmentItemDef(name: 'Socks', quantity: '30'),
    _EquipmentItemDef(name: 'Cable ties', quantity: '2 bags'),
    _EquipmentItemDef(name: 'Parachute cord', quantity: '20 feet'),
    _EquipmentItemDef(name: 'Omni antenna', quantity: '1'),
    _EquipmentItemDef(name: 'Receiver and holster', quantity: '1'),
    _EquipmentItemDef(name: 'Square transmitter antenna', quantity: '8'),
    _EquipmentItemDef(name: 'Lighters', quantity: '1'),
    _EquipmentItemDef(name: 'Surge protector', quantity: '1'),
    _EquipmentItemDef(name: 'Cords for charging', quantity: '2'),
    _EquipmentItemDef(name: 'Tupperware for tidbits', quantity: '3'),
    _EquipmentItemDef(name: 'Sponges', quantity: '2'),
    _EquipmentItemDef(name: 'Hood holster spare', quantity: '1'),
    _EquipmentItemDef(name: 'Pellets and scooper', quantity: 'Variable'),
  ];

  late final Map<String, bool> _checked = {
    for (final section in _sections)
      for (final item in section.items)
        _rowKey(section.title, item.name): false,
    for (final item in _falconTelemetryItems)
      _rowKey('Falcon', item.name): false,
  };
  late final Map<String, bool> _notWorking = {
    for (final section in _sections)
      for (final item in section.items)
        _rowKey(section.title, item.name): false,
    for (final item in _falconTelemetryItems)
      _rowKey('Falcon', item.name): false,
  };
  late final Map<String, TextEditingController> _actualQtyControllers = {
    for (final section in _sections)
      for (final item in section.items)
        _rowKey(section.title, item.name): TextEditingController(),
    for (final item in _falconTelemetryItems)
      _rowKey('Falcon', item.name): TextEditingController(),
  };
  final _gpsTx1SerialController = TextEditingController();
  final _gpsTx1FrequencyController = TextEditingController();
  final _gpsTx2SerialController = TextEditingController();
  final _gpsTx2FrequencyController = TextEditingController();
  final _rhfTx1SerialController = TextEditingController();
  final _rhfTx1FrequencyController = TextEditingController();
  final _rhfTx2SerialController = TextEditingController();
  final _rhfTx2FrequencyController = TextEditingController();
  final _pocketLinkSerialController = TextEditingController();
  final _iPhonePasscodeController = TextEditingController();
  final _appleIdController = TextEditingController();
  final _appleIdPasswordController = TextEditingController();
  final _phoneNumberController = TextEditingController();
  final _b1rdEmailController = TextEditingController();
  final _b1rdEmailPasswordController = TextEditingController();

  @override
  void dispose() {
    for (final controller in _actualQtyControllers.values) {
      controller.dispose();
    }
    _gpsTx1SerialController.dispose();
    _gpsTx1FrequencyController.dispose();
    _gpsTx2SerialController.dispose();
    _gpsTx2FrequencyController.dispose();
    _rhfTx1SerialController.dispose();
    _rhfTx1FrequencyController.dispose();
    _rhfTx2SerialController.dispose();
    _rhfTx2FrequencyController.dispose();
    _pocketLinkSerialController.dispose();
    _iPhonePasscodeController.dispose();
    _appleIdController.dispose();
    _appleIdPasswordController.dispose();
    _phoneNumberController.dispose();
    _b1rdEmailController.dispose();
    _b1rdEmailPasswordController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final totalItems = _checked.length;
    final checkedCount = _checked.values.where((v) => v).length;
    final notWorkingCount = _notWorking.values.where((v) => v).length;
    return Scaffold(
      appBar: AppBar(title: const Text('Equipment List')),
      body: ListView(
        padding: const EdgeInsets.all(10),
        children: [
          Text(
            'Checked $checkedCount / $totalItems',
            style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w700),
          ),
          const SizedBox(height: 2),
          Text(
            'Not Working marked: $notWorkingCount',
            style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w700),
          ),
          const SizedBox(height: 3),
          ..._sections.map((section) => _sectionCard(section)),
        ],
      ),
    );
  }

  Widget _sectionCard(_EquipmentSectionDef section) {
    return Card(
      margin: const EdgeInsets.only(bottom: 2),
      child: Padding(
        padding: const EdgeInsets.all(2),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              section.title,
              style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w800),
            ),
            const SizedBox(height: 1),
            Container(
              color: const Color(0xFFF3F4F6),
              padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 0),
              child: const Row(
                children: [
                  Expanded(
                    child: Text(
                      'Item',
                      style: TextStyle(
                        fontSize: 12.5,
                        fontWeight: FontWeight.w700,
                        height: 0.95,
                      ),
                    ),
                  ),
                  SizedBox(
                    width: 70,
                    child: Text(
                      'Ideal Qty',
                      textAlign: TextAlign.center,
                      style: TextStyle(
                        fontSize: 11.8,
                        fontWeight: FontWeight.w700,
                        height: 0.95,
                      ),
                    ),
                  ),
                  SizedBox(
                    width: 74,
                    child: Text(
                      'Actual Qty',
                      textAlign: TextAlign.center,
                      style: TextStyle(
                        fontSize: 11.8,
                        fontWeight: FontWeight.w700,
                        height: 0.95,
                      ),
                    ),
                  ),
                  SizedBox(
                    width: 68,
                    child: Text(
                      'WORKING',
                      textAlign: TextAlign.center,
                      style: TextStyle(
                        fontSize: 10.8,
                        fontWeight: FontWeight.w700,
                        height: 0.95,
                      ),
                    ),
                  ),
                  SizedBox(
                    width: 74,
                    child: Text(
                      'Not Working',
                      textAlign: TextAlign.center,
                      style: TextStyle(
                        fontSize: 10.6,
                        fontWeight: FontWeight.w700,
                        height: 0.95,
                      ),
                    ),
                  ),
                ],
              ),
            ),
            ...section.items.map((item) => _equipmentRow(section.title, item)),
            if (section.title == 'Falcon') ...[
              const SizedBox(height: 4),
              _transmitterEntryRow(
                title: 'GPS Transmitter 1',
                serialController: _gpsTx1SerialController,
                frequencyController: _gpsTx1FrequencyController,
              ),
              _transmitterEntryRow(
                title: 'GPS Transmitter 2',
                serialController: _gpsTx2SerialController,
                frequencyController: _gpsTx2FrequencyController,
              ),
              _transmitterEntryRow(
                title: 'RHF (grey) Transmitter 1',
                serialController: _rhfTx1SerialController,
                frequencyController: _rhfTx1FrequencyController,
              ),
              _transmitterEntryRow(
                title: 'RHF (grey) Transmitter 2',
                serialController: _rhfTx2SerialController,
                frequencyController: _rhfTx2FrequencyController,
              ),
              _singleEntryRow(
                title: 'PocketLink: Serial Number',
                controller: _pocketLinkSerialController,
                digitsOnly: true,
              ),
              _singleEntryRow(
                title: 'iPhone: passcode',
                controller: _iPhonePasscodeController,
              ),
              _singleEntryRow(
                title: 'Apple ID',
                controller: _appleIdController,
              ),
              _singleEntryRow(
                title: 'Apple ID password',
                controller: _appleIdPasswordController,
              ),
              _singleEntryRow(
                title: 'Phone number',
                controller: _phoneNumberController,
                digitsOnly: true,
              ),
              _singleEntryRow(
                title: 'B1RD email address',
                controller: _b1rdEmailController,
              ),
              _singleEntryRow(
                title: 'B1RD email address password',
                controller: _b1rdEmailPasswordController,
              ),
              const SizedBox(height: 4),
              ..._falconTelemetryItems.map(
                (item) => _equipmentRow('Falcon', item),
              ),
            ],
          ],
        ),
      ),
    );
  }

  Widget _equipmentRow(String sectionTitle, _EquipmentItemDef item) {
    final key = _rowKey(sectionTitle, item.name);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 0),
      decoration: const BoxDecoration(
        border: Border(
          bottom: BorderSide(color: Color(0xFFE5E7EB), width: 0.7),
        ),
      ),
      child: Row(
        children: [
          Expanded(
            child: Text(
              item.name,
              style: const TextStyle(
                fontSize: 15.2,
                fontWeight: FontWeight.w600,
                height: 0.95,
                letterSpacing: -0.15,
              ),
            ),
          ),
          SizedBox(
            width: 70,
            child: Text(
              item.quantity,
              textAlign: TextAlign.center,
              style: const TextStyle(
                fontSize: 13.5,
                fontWeight: FontWeight.w700,
                height: 0.95,
              ),
            ),
          ),
          SizedBox(
            width: 74,
            child: Padding(
              padding: const EdgeInsets.symmetric(vertical: 2),
              child: TextField(
                controller: _actualQtyControllers[key],
                textAlign: TextAlign.center,
                style: const TextStyle(
                  fontSize: 12.2,
                  fontWeight: FontWeight.w700,
                  height: 1.0,
                ),
                decoration: const InputDecoration(
                  isDense: true,
                  hintText: '--',
                  contentPadding: EdgeInsets.symmetric(
                    horizontal: 4,
                    vertical: 6,
                  ),
                ),
              ),
            ),
          ),
          SizedBox(
            width: 68,
            child: Center(
              child: Transform.scale(
                scale: 1.6,
                child: Checkbox(
                  value: _checked[key] ?? false,
                  visualDensity: VisualDensity.standard,
                  materialTapTargetSize: MaterialTapTargetSize.padded,
                  onChanged: (value) {
                    setState(() {
                      _checked[key] = value ?? false;
                    });
                  },
                ),
              ),
            ),
          ),
          SizedBox(
            width: 74,
            child: Center(
              child: Transform.scale(
                scale: 1.6,
                child: Checkbox(
                  value: _notWorking[key] ?? false,
                  visualDensity: VisualDensity.standard,
                  materialTapTargetSize: MaterialTapTargetSize.padded,
                  onChanged: (value) {
                    setState(() {
                      _notWorking[key] = value ?? false;
                    });
                  },
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  String _rowKey(String sectionTitle, String itemName) {
    return '$sectionTitle::$itemName';
  }

  Widget _transmitterEntryRow({
    required String title,
    required TextEditingController serialController,
    required TextEditingController frequencyController,
  }) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 4),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            title,
            style: const TextStyle(fontSize: 9.8, fontWeight: FontWeight.w800),
          ),
          const SizedBox(height: 2),
          Row(
            children: [
              Expanded(
                child: _equipmentInput(
                  controller: serialController,
                  hint: 'Serial #',
                  digitsOnly: true,
                  maxLength: 7,
                ),
              ),
              const SizedBox(width: 4),
              Expanded(
                child: _equipmentInput(
                  controller: frequencyController,
                  hint: 'Frequency',
                  digitsOnly: true,
                  maxLength: 7,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _singleEntryRow({
    required String title,
    required TextEditingController controller,
    bool digitsOnly = false,
  }) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 4),
      child: Row(
        children: [
          SizedBox(
            width: 152,
            child: Text(
              title,
              style: const TextStyle(
                fontSize: 9.4,
                fontWeight: FontWeight.w700,
              ),
            ),
          ),
          const SizedBox(width: 4),
          Expanded(
            child: _equipmentInput(
              controller: controller,
              hint: 'Enter',
              digitsOnly: digitsOnly,
            ),
          ),
        ],
      ),
    );
  }

  Widget _equipmentInput({
    required TextEditingController controller,
    required String hint,
    bool digitsOnly = false,
    int? maxLength,
  }) {
    return SizedBox(
      height: 28,
      child: TextField(
        controller: controller,
        keyboardType: digitsOnly ? TextInputType.number : TextInputType.text,
        inputFormatters: [
          if (digitsOnly) FilteringTextInputFormatter.digitsOnly,
          if (maxLength != null) LengthLimitingTextInputFormatter(maxLength),
        ],
        style: const TextStyle(fontSize: 10.2, fontWeight: FontWeight.w600),
        decoration: InputDecoration(
          hintText: hint,
          hintStyle: const TextStyle(fontSize: 9.5),
          counterText: '',
          isDense: true,
          contentPadding: const EdgeInsets.symmetric(
            horizontal: 6,
            vertical: 6,
          ),
        ),
      ),
    );
  }
}

class DailyScheduleScreen extends StatelessWidget {
  const DailyScheduleScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Daily Schedule')),
      body: ListView(
        padding: const EdgeInsets.all(12),
        children: [_sectionHeader('Daily Flight Plan'), _dailyTimelineTable()],
      ),
    );
  }

  Widget _sectionHeader(String label) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 6),
      child: Text(
        label,
        style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w900),
      ),
    );
  }

  Widget _dailyTimelineTable() {
    const rows = [
      ('Hood Off: Flying Start Time', 'Sunrise', ''),
      ('FS Break', '2 hours after sunrise', '30 minutes'),
      ('Hood On: Flying End Time', '4 hours after sunrise', ''),
      ('Extra break window if bird pressure is low', '11 AM - 2 PM', ''),
      ('Mid day Break', '', 'Eat, nap, walk 20 minutes, stretch'),
      ('ATV patrol', '2 PM - 3 PM', ''),
      ('#2 Falcon: Start preparing second falcon', '3 PM', ''),
      ('Hood Off: Flying Start Time', '3:30 PM', ''),
      ('FS Break', '5 PM - 5:30 PM', ''),
      ('Hood On: Flying End Time', 'End by 7 PM', ''),
      (
        'Late patrol (if needed)',
        '',
        'Patrol without falcon to make sure starlings are not coming in late evening',
      ),
    ];

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(10),
        child: Table(
          columnWidths: const {
            0: FlexColumnWidth(2.8),
            1: FlexColumnWidth(2.2),
            2: FlexColumnWidth(2.4),
          },
          defaultVerticalAlignment: TableCellVerticalAlignment.middle,
          border: TableBorder.all(color: Color(0xFFE5E7EB)),
          children: [
            const TableRow(
              decoration: BoxDecoration(color: Color(0xFFF3F4F6)),
              children: [
                Padding(
                  padding: EdgeInsets.all(6),
                  child: Text(
                    'Task',
                    style: TextStyle(fontWeight: FontWeight.w800),
                  ),
                ),
                Padding(
                  padding: EdgeInsets.all(6),
                  child: Text(
                    'Time',
                    style: TextStyle(fontWeight: FontWeight.w800),
                  ),
                ),
                Padding(
                  padding: EdgeInsets.all(6),
                  child: Text(
                    'Notes',
                    style: TextStyle(fontWeight: FontWeight.w800),
                  ),
                ),
              ],
            ),
            ...rows.map(
              (r) => TableRow(
                children: [
                  Padding(
                    padding: const EdgeInsets.all(6),
                    child: Text(
                      r.$1,
                      style: const TextStyle(
                        fontSize: 12.5,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                  Padding(
                    padding: const EdgeInsets.all(6),
                    child: Text(
                      r.$2,
                      style: const TextStyle(
                        fontSize: 12.5,
                        fontWeight: FontWeight.w700,
                      ),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                  Padding(
                    padding: const EdgeInsets.all(6),
                    child: Text(
                      r.$3,
                      style: const TextStyle(
                        fontSize: 12.3,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class GeneralStarlingWorkPatternScreen extends StatelessWidget {
  const GeneralStarlingWorkPatternScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('General Starling and Work Pattern for a Contract'),
      ),
      body: ListView(
        padding: const EdgeInsets.all(12),
        children: const [
          Card(
            child: Padding(
              padding: EdgeInsets.all(10),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  _WeekPatternBlock(
                    title: 'Week 1-3',
                    text:
                        'Start with high effort conditioning in the immediate area. The goal is to fly as much as possible so falcons get fit and learn the area before heat rises. Keep sleep, hydration, and exercise steady.',
                  ),
                  SizedBox(height: 8),
                  _WeekPatternBlock(
                    title: 'Week 4-6',
                    text:
                        'After 3 weeks of longer hours, switch to taking longer breaks and maybe 2-hour afternoon windows. Focus on quality negative conditioning with repeat flushes and whistles, especially on the same flock.',
                  ),
                  SizedBox(height: 8),
                  _WeekPatternBlock(
                    title: 'Week 7-12',
                    text:
                        'Bird pressure usually drops. Continue patrols around perimeter, keep falcon attention high, and reward follow-up behavior after chase events.',
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class WeeklyWorkScheduleScreen extends StatelessWidget {
  const WeeklyWorkScheduleScreen({super.key});

  @override
  Widget build(BuildContext context) {
    const weeklyRows = [
      ('MON', 'Work day', 'Fly - evening exercise'),
      ('TUE', 'Work day', 'Fly - evening exercise'),
      ('WED', 'Work day', 'Fly - evening exercise'),
      ('THU', 'Work day', 'Fly - evening exercise'),
      ('FRI', 'Work day', 'Fly - evening exercise'),
      ('SAT', 'Work day', 'Fly - laundry, grocery shop'),
      (
        'SUN',
        'Day off if starling pressure is low',
        'Sleep in, naps, clean/reorganize; feed falcons AM and PM on fist',
      ),
    ];

    return Scaffold(
      appBar: AppBar(title: const Text('Weekly Work Schedule')),
      body: ListView(
        padding: const EdgeInsets.all(12),
        children: [
          Card(
            child: Padding(
              padding: const EdgeInsets.all(10),
              child: Table(
                columnWidths: const {
                  0: FlexColumnWidth(1.3),
                  1: FlexColumnWidth(2.2),
                  2: FlexColumnWidth(2.6),
                },
                defaultVerticalAlignment: TableCellVerticalAlignment.middle,
                border: TableBorder.all(color: const Color(0xFFE5E7EB)),
                children: [
                  const TableRow(
                    decoration: BoxDecoration(color: Color(0xFFF3F4F6)),
                    children: [
                      Padding(
                        padding: EdgeInsets.all(6),
                        child: Text(
                          'Day',
                          style: TextStyle(fontWeight: FontWeight.w800),
                        ),
                      ),
                      Padding(
                        padding: EdgeInsets.all(6),
                        child: Text(
                          'Work',
                          style: TextStyle(fontWeight: FontWeight.w800),
                        ),
                      ),
                      Padding(
                        padding: EdgeInsets.all(6),
                        child: Text(
                          'Plan',
                          style: TextStyle(fontWeight: FontWeight.w800),
                        ),
                      ),
                    ],
                  ),
                  ...weeklyRows.map(
                    (r) => TableRow(
                      children: [
                        Padding(
                          padding: const EdgeInsets.all(6),
                          child: Text(
                            r.$1,
                            style: const TextStyle(
                              fontSize: 12.5,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                        ),
                        Padding(
                          padding: const EdgeInsets.all(6),
                          child: Text(
                            r.$2,
                            style: const TextStyle(
                              fontSize: 12.4,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ),
                        Padding(
                          padding: const EdgeInsets.all(6),
                          child: Text(
                            r.$3,
                            style: const TextStyle(
                              fontSize: 12.4,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _WeekPatternBlock extends StatelessWidget {
  const _WeekPatternBlock({required this.title, required this.text});

  final String title;
  final String text;

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SizedBox(
          width: 72,
          child: Text(
            title,
            style: const TextStyle(fontSize: 12.8, fontWeight: FontWeight.w800),
          ),
        ),
        const SizedBox(width: 8),
        Expanded(
          child: Text(
            text,
            style: const TextStyle(fontSize: 12.8, fontWeight: FontWeight.w600),
          ),
        ),
      ],
    );
  }
}

class WorkProtocolScreen extends StatelessWidget {
  const WorkProtocolScreen({super.key});

  static const List<_WorkProtocolSection> _sections = [
    _WorkProtocolSection(
      title: 'LEAVING CONTRACT DURING WORKING HOURS',
      lines: [
        'If you leave the contract during working hours (sunrise to sunset), fill in the log that you left before leaving and log back in when you return.',
        'This allows managers to know whether you are on site or off-site for bird control/patrol and provide customers a definitive answer.',
      ],
    ),
    _WorkProtocolSection(
      title: 'CUSTOMERS',
      lines: [
        'Do not ask customers for help or assistance. Call, text, email your manager first.',
      ],
    ),
    _WorkProtocolSection(
      title: 'FALCONS',
      lines: [
        'Keep falcons cool and stress-free.',
        'Make sure RV AC is set at settings that will continue to work if you are not in the RV.',
      ],
    ),
    _WorkProtocolSection(
      title: 'PICTURES AND SHARING',
      lines: [
        'Do not take pictures of falcons on personal or company phones.',
        'Do not send pictures to anyone for any reason.',
        'Falcons, equipment, customer location, customer name, and customer information are confidential and must not be shared outside the company (past or present).',
      ],
      isCritical: true,
    ),
    _WorkProtocolSection(
      title: 'TELEMETRY BATTERIES',
      lines: ['Always fly with working telemetry and fresh batteries.'],
    ),
    _WorkProtocolSection(
      title: 'FALCON FEED',
      lines: [
        'Always use quail that is freshly thawed.',
        'Never microwave or cook quail.',
      ],
    ),
    _WorkProtocolSection(
      title: 'ATV',
      lines: [
        "Drive ATV's in a slow, safe, controlled manner.",
        'If moving forward, keep eyes forward. If you need to look back, stop first.',
        'Stop at intersections in the field before crossing.',
        'Drive in a safe, predictable manner and give way to farm equipment/operators.',
        'Use paths that avoid congested areas or high human traffic.',
        "Drive slowly enough to avoid unnecessary dust and don't track out areas.",
        'Do not drive down rows between fruit plants.',
        'Do not tie anything to the exterior of the ATV or alter/change ATV appearance.',
        'Do not attempt repairs without prior consent.',
        'Wash and clean dead grass/mud/dirt off each ATV daily or more often if needed.',
      ],
    ),
    _WorkProtocolSection(
      title: 'RV',
      lines: [
        "Keep RV interior and exterior clean. Vacuum, mop, wipe down weekly plus general daily cleaning.",
        'Sit down on the toilet for urination to keep bathroom area clean.',
        'RV materials are lighter and less durable than residential; use gently and close doors carefully.',
        'Empty grey/black water tanks past 3/4 full, run black flush then grey flush, and close valves when not in use.',
        'Do not bring extra stuff in the RV. Only what you need.',
      ],
    ),
    _WorkProtocolSection(
      title: 'EQUIPMENT, FAILURE, OR LOSS',
      lines: [
        'Notify your manager in real time for missing or lost, not working equipment.',
        'Check the box in your Equipment Log area for not working column.',
      ],
    ),
    _WorkProtocolSection(
      title: 'DIFFERENT TOOLS FOR BIRD CONTROL',
      lines: [
        'Do not introduce/use tools other than what is provided.',
        'No slingshots, guns, cannons, sirens, crackers, fog horns, drones, BB guns, airsoft guns, paintball guns, traps, etc.',
      ],
    ),
  ];

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Work Protocol')),
      body: ListView(
        padding: const EdgeInsets.all(12),
        children: [
          const Text(
            'B1RD WORK PROTOCOL',
            style: TextStyle(fontSize: 24, fontWeight: FontWeight.w900),
          ),
          const SizedBox(height: 10),
          ..._sections.map((section) => _buildSection(section)),
        ],
      ),
    );
  }

  Widget _buildSection(_WorkProtocolSection section) {
    final bgColor = section.isCritical
        ? const Color(0xFFFECACA)
        : const Color(0xFFF9FAFB);
    final borderColor = section.isCritical
        ? const Color(0xFFDC2626)
        : const Color(0xFFD1D5DB);
    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      color: bgColor,
      shape: RoundedRectangleBorder(
        side: BorderSide(color: borderColor),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Padding(
        padding: const EdgeInsets.all(10),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              section.title,
              style: TextStyle(
                fontSize: 14,
                fontWeight: FontWeight.w900,
                color: section.isCritical
                    ? const Color(0xFF7F1D1D)
                    : const Color(0xFF111827),
              ),
            ),
            const SizedBox(height: 6),
            ...section.lines.map(
              (line) => Padding(
                padding: const EdgeInsets.only(bottom: 4),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text(
                      '\u2022 ',
                      style: TextStyle(
                        fontSize: 13,
                        height: 1.3,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                    Expanded(
                      child: Text(
                        line,
                        style: const TextStyle(
                          fontSize: 13,
                          height: 1.3,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _WorkProtocolSection {
  const _WorkProtocolSection({
    required this.title,
    required this.lines,
    this.isCritical = false,
  });

  final String title;
  final List<String> lines;
  final bool isCritical;
}

class SiteInformationScreen extends StatefulWidget {
  const SiteInformationScreen({super.key});

  @override
  State<SiteInformationScreen> createState() => _SiteInformationScreenState();
}

class _SiteInformationScreenState extends State<SiteInformationScreen> {
  final _addressController = TextEditingController();
  final _entranceCodesController = TextEditingController();
  final _gasCodesController = TextEditingController();
  final _farmManagerNameController = TextEditingController();
  final _farmManagerNumberController = TextEditingController();

  @override
  void dispose() {
    _addressController.dispose();
    _entranceCodesController.dispose();
    _gasCodesController.dispose();
    _farmManagerNameController.dispose();
    _farmManagerNumberController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Site Information')),
      body: ListView(
        padding: const EdgeInsets.all(14),
        children: [
          const Text(
            'Site Information',
            style: TextStyle(fontSize: 24, fontWeight: FontWeight.w900),
          ),
          const SizedBox(height: 10),
          Card(
            child: Padding(
              padding: const EdgeInsets.all(12),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  _siteField(
                    label: 'Address',
                    controller: _addressController,
                    maxLines: 2,
                    hint: 'Enter full site address',
                  ),
                  const SizedBox(height: 10),
                  _siteField(
                    label: 'Entrance Codes',
                    controller: _entranceCodesController,
                    maxLines: 2,
                    hint: 'Enter gate/entrance access codes',
                  ),
                  const SizedBox(height: 10),
                  _siteField(
                    label: 'Gas Codes',
                    controller: _gasCodesController,
                    maxLines: 2,
                    hint: 'Enter fuel/gas access codes',
                  ),
                  const SizedBox(height: 10),
                  _siteField(
                    label: 'Farm Manager Name',
                    controller: _farmManagerNameController,
                    hint: 'Enter farm manager name',
                  ),
                  const SizedBox(height: 10),
                  _siteField(
                    label: 'Farm Manager Number',
                    controller: _farmManagerNumberController,
                    hint: 'Enter farm manager phone number',
                    keyboardType: TextInputType.phone,
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _siteField({
    required String label,
    required TextEditingController controller,
    required String hint,
    int maxLines = 1,
    TextInputType keyboardType = TextInputType.text,
  }) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          label,
          style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w800),
        ),
        const SizedBox(height: 4),
        TextField(
          controller: controller,
          maxLines: maxLines,
          keyboardType: keyboardType,
          decoration: InputDecoration(
            hintText: hint,
            filled: true,
            fillColor: const Color(0xFFD6E8FF),
            border: const OutlineInputBorder(),
            isDense: true,
            contentPadding: const EdgeInsets.symmetric(
              horizontal: 10,
              vertical: 10,
            ),
          ),
        ),
      ],
    );
  }
}

class ContactInformationScreen extends StatelessWidget {
  const ContactInformationScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Contact Information')),
      body: ListView(
        padding: const EdgeInsets.all(14),
        children: [
          const Text(
            'Contact Information',
            style: TextStyle(fontSize: 24, fontWeight: FontWeight.w900),
          ),
          const SizedBox(height: 10),
          Card(
            child: Padding(
              padding: const EdgeInsets.all(12),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: const [
                  _ContactLine(label: 'B1RD Owner', value: 'Getty Pollard'),
                  SizedBox(height: 10),
                  _ContactLine(label: 'Phone Number', value: '541-263-1545'),
                  SizedBox(height: 10),
                  _ContactLine(
                    label: 'Address',
                    value: '69602 Warnock Road, Lostine, Oregon 97857',
                  ),
                  SizedBox(height: 10),
                  _ContactLine(
                    label: 'Email Address',
                    value: 'Getty@B-1RD.com',
                  ),
                  SizedBox(height: 10),
                  _ContactLine(label: 'Website', value: 'www.B-1RD.com'),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _ContactLine extends StatelessWidget {
  const _ContactLine({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          label,
          style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w800),
        ),
        const SizedBox(height: 2),
        SelectableText(
          value,
          style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600),
        ),
      ],
    );
  }
}

enum FlightHoursView { weekly, monthly }

class FlightHoursSummaryScreen extends StatefulWidget {
  const FlightHoursSummaryScreen({super.key, required this.controller});

  final FalconAppController controller;

  @override
  State<FlightHoursSummaryScreen> createState() =>
      _FlightHoursSummaryScreenState();
}

class _FlightHoursSummaryScreenState extends State<FlightHoursSummaryScreen> {
  FlightHoursView _view = FlightHoursView.monthly;
  late DateTime _monthAnchor;
  late DateTime _weekAnchor;

  @override
  void initState() {
    super.initState();
    final today = _dateOnly(DateTime.now());
    _monthAnchor = DateTime(today.year, today.month, 1);
    _weekAnchor = _weekStart(today);
  }

  @override
  Widget build(BuildContext context) {
    final sessions = widget.controller.currentUserSessions;
    final dailyMinutes = _aggregateDailyFlyingMinutes(sessions);
    final sortedDays = dailyMinutes.keys.toList()..sort();
    final totalMinutes = dailyMinutes.values.fold<double>(
      0,
      (sum, value) => sum + value,
    );
    final activeMinutes = _view == FlightHoursView.monthly
        ? _monthlyMinutes(dailyMinutes, _monthAnchor)
        : _weeklyMinutes(dailyMinutes, _weekAnchor);

    return Scaffold(
      appBar: AppBar(title: const Text('Flight Total Flight Hours')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Card(
            color: const Color(0xFFEAF5E4),
            child: Padding(
              padding: const EdgeInsets.all(12),
              child: Wrap(
                spacing: 10,
                runSpacing: 6,
                children: [
                  _summaryMetric('All-time flown', _hoursLabel(totalMinutes)),
                  _summaryMetric(
                    'Days flown',
                    '${dailyMinutes.entries.where((e) => e.value > 0).length}',
                  ),
                  _summaryMetric(
                    _view == FlightHoursView.monthly
                        ? 'This month'
                        : 'This week',
                    _hoursLabel(activeMinutes),
                  ),
                  _summaryMetric(
                    'Range',
                    sortedDays.isEmpty
                        ? '-'
                        : '${DateFormat('MMM d, yyyy').format(sortedDays.first)} to ${DateFormat('MMM d, yyyy').format(sortedDays.last)}',
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 10),
          SegmentedButton<FlightHoursView>(
            segments: const [
              ButtonSegment(
                value: FlightHoursView.weekly,
                label: Text('Weekly'),
              ),
              ButtonSegment(
                value: FlightHoursView.monthly,
                label: Text('Monthly'),
              ),
            ],
            selected: {_view},
            onSelectionChanged: (selected) {
              setState(() => _view = selected.first);
            },
            showSelectedIcon: false,
          ),
          const SizedBox(height: 10),
          if (dailyMinutes.isEmpty)
            const Card(
              child: Padding(
                padding: EdgeInsets.all(12),
                child: Text('No completed flight-hour data yet.'),
              ),
            )
          else if (_view == FlightHoursView.weekly)
            _buildWeeklyView(dailyMinutes)
          else
            _buildMonthlyView(dailyMinutes),
        ],
      ),
    );
  }

  Widget _summaryMetric(String label, String value) {
    return RichText(
      text: TextSpan(
        style: const TextStyle(color: Colors.black87),
        children: [
          TextSpan(
            text: '$label: ',
            style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 12),
          ),
          TextSpan(text: value, style: const TextStyle(fontSize: 12)),
        ],
      ),
    );
  }

  Widget _buildWeeklyView(Map<DateTime, double> dailyMinutes) {
    final maxMinutes = _maxWeekMinutes(dailyMinutes, _weekAnchor);
    final weekEnd = _weekAnchor.add(const Duration(days: 6));

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(10),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                IconButton(
                  onPressed: () {
                    setState(() {
                      _weekAnchor = _weekAnchor.subtract(
                        const Duration(days: 7),
                      );
                    });
                  },
                  icon: const Icon(Icons.chevron_left),
                ),
                Expanded(
                  child: Text(
                    '${DateFormat('MMM d').format(_weekAnchor)} - ${DateFormat('MMM d, yyyy').format(weekEnd)}',
                    textAlign: TextAlign.center,
                    style: const TextStyle(
                      fontWeight: FontWeight.w700,
                      fontSize: 13,
                    ),
                  ),
                ),
                IconButton(
                  onPressed: () {
                    setState(() {
                      _weekAnchor = _weekAnchor.add(const Duration(days: 7));
                    });
                  },
                  icon: const Icon(Icons.chevron_right),
                ),
              ],
            ),
            const SizedBox(height: 4),
            ...List.generate(7, (offset) {
              final day = _weekAnchor.add(Duration(days: offset));
              final key = _dateOnly(day);
              final minutes = dailyMinutes[key] ?? 0;
              final ratio = maxMinutes <= 0 ? 0.0 : (minutes / maxMinutes);
              return Padding(
                padding: const EdgeInsets.symmetric(vertical: 4),
                child: Row(
                  children: [
                    SizedBox(
                      width: 92,
                      child: Text(
                        '${DateFormat('EEE').format(day)} ${DateFormat('M/d').format(day)}',
                        style: const TextStyle(fontSize: 12),
                      ),
                    ),
                    Expanded(
                      child: ClipRRect(
                        borderRadius: BorderRadius.circular(8),
                        child: LinearProgressIndicator(
                          value: ratio,
                          minHeight: 10,
                          backgroundColor: const Color(0xFFE5E7EB),
                          color: const Color(0xFF1E5E2D),
                        ),
                      ),
                    ),
                    const SizedBox(width: 8),
                    SizedBox(
                      width: 58,
                      child: Text(
                        _hoursShort(minutes),
                        textAlign: TextAlign.right,
                        style: const TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                  ],
                ),
              );
            }),
          ],
        ),
      ),
    );
  }

  Widget _buildMonthlyView(Map<DateTime, double> dailyMinutes) {
    final monthStart = DateTime(_monthAnchor.year, _monthAnchor.month, 1);
    final monthEnd = DateTime(_monthAnchor.year, _monthAnchor.month + 1, 0);
    final leading = monthStart.weekday - 1;
    final totalCells = ((leading + monthEnd.day + 6) ~/ 7) * 7;
    const dayLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(10),
        child: Column(
          children: [
            Row(
              children: [
                IconButton(
                  onPressed: () {
                    setState(() {
                      _monthAnchor = DateTime(
                        _monthAnchor.year,
                        _monthAnchor.month - 1,
                        1,
                      );
                    });
                  },
                  icon: const Icon(Icons.chevron_left),
                ),
                Expanded(
                  child: Text(
                    DateFormat('MMMM yyyy').format(_monthAnchor),
                    textAlign: TextAlign.center,
                    style: const TextStyle(
                      fontWeight: FontWeight.w700,
                      fontSize: 14,
                    ),
                  ),
                ),
                IconButton(
                  onPressed: () {
                    setState(() {
                      _monthAnchor = DateTime(
                        _monthAnchor.year,
                        _monthAnchor.month + 1,
                        1,
                      );
                    });
                  },
                  icon: const Icon(Icons.chevron_right),
                ),
              ],
            ),
            const SizedBox(height: 4),
            Row(
              children: dayLabels
                  .map(
                    (label) => Expanded(
                      child: Text(
                        label,
                        textAlign: TextAlign.center,
                        style: const TextStyle(
                          fontSize: 11,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                  )
                  .toList(),
            ),
            const SizedBox(height: 6),
            GridView.builder(
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                crossAxisCount: 7,
                mainAxisSpacing: 4,
                crossAxisSpacing: 4,
                childAspectRatio: 0.88,
              ),
              itemCount: totalCells,
              itemBuilder: (context, index) {
                final dayNumber = index - leading + 1;
                if (dayNumber < 1 || dayNumber > monthEnd.day) {
                  return Container(
                    decoration: BoxDecoration(
                      color: const Color(0xFFF3F4F6),
                      borderRadius: BorderRadius.circular(8),
                    ),
                  );
                }

                final day = DateTime(
                  _monthAnchor.year,
                  _monthAnchor.month,
                  dayNumber,
                );
                final minutes = dailyMinutes[_dateOnly(day)] ?? 0;
                final ratio = (minutes / 240).clamp(0.0, 1.0);
                final bg = Color.lerp(
                  const Color(0xFFF4F7F2),
                  const Color(0xFFA8D08D),
                  ratio,
                )!;

                return Container(
                  decoration: BoxDecoration(
                    color: bg,
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(color: const Color(0xFFCBD5E1)),
                  ),
                  padding: const EdgeInsets.fromLTRB(4, 4, 4, 3),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        '$dayNumber',
                        style: const TextStyle(
                          fontSize: 11,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                      const Spacer(),
                      Text(
                        _hoursShort(minutes),
                        style: const TextStyle(
                          fontSize: 10.5,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ],
                  ),
                );
              },
            ),
            const SizedBox(height: 8),
            const Align(
              alignment: Alignment.centerLeft,
              child: Text(
                'Darker green means more flying hours for that day.',
                style: TextStyle(fontSize: 11, color: Colors.black54),
              ),
            ),
          ],
        ),
      ),
    );
  }

  double _maxWeekMinutes(
    Map<DateTime, double> dailyMinutes,
    DateTime weekStart,
  ) {
    var maxValue = 0.0;
    for (var i = 0; i < 7; i++) {
      final day = _dateOnly(weekStart.add(Duration(days: i)));
      final value = dailyMinutes[day] ?? 0;
      if (value > maxValue) {
        maxValue = value;
      }
    }
    return maxValue <= 0 ? 1 : maxValue;
  }

  double _weeklyMinutes(
    Map<DateTime, double> dailyMinutes,
    DateTime weekStart,
  ) {
    var total = 0.0;
    for (var i = 0; i < 7; i++) {
      total += dailyMinutes[_dateOnly(weekStart.add(Duration(days: i)))] ?? 0;
    }
    return total;
  }

  double _monthlyMinutes(Map<DateTime, double> dailyMinutes, DateTime month) {
    final monthStart = DateTime(month.year, month.month, 1);
    final monthEnd = DateTime(month.year, month.month + 1, 0);
    var total = 0.0;
    for (var day = 1; day <= monthEnd.day; day++) {
      total +=
          dailyMinutes[DateTime(monthStart.year, monthStart.month, day)] ?? 0;
    }
    return total;
  }

  DateTime _weekStart(DateTime date) {
    final day = _dateOnly(date);
    return day.subtract(Duration(days: day.weekday - 1));
  }

  DateTime _dateOnly(DateTime value) {
    return DateTime(value.year, value.month, value.day);
  }

  String _hoursLabel(double minutes) {
    return '${(minutes / 60).toStringAsFixed(1)}h';
  }

  String _hoursShort(double minutes) {
    if (minutes <= 0) {
      return '0h';
    }
    return '${(minutes / 60).toStringAsFixed(1)}h';
  }

  Map<DateTime, double> _aggregateDailyFlyingMinutes(
    List<SessionRecord> sessions,
  ) {
    final daily = <DateTime, double>{};
    for (final session in sessions) {
      final events = [...session.events]..sort((a, b) => a.at.compareTo(b.at));
      DateTime? start;
      for (final event in events) {
        if (event.type == SessionEventType.flyingStart && start == null) {
          start = event.at;
          continue;
        }
        if (event.type == SessionEventType.flyingEnd && start != null) {
          _addInterval(daily, start, event.at);
          start = null;
        }
      }
      if (start != null) {
        final end = session.endAt ?? DateTime.now();
        _addInterval(daily, start, end);
      }
    }
    return daily;
  }

  void _addInterval(Map<DateTime, double> daily, DateTime start, DateTime end) {
    if (!end.isAfter(start)) {
      return;
    }
    var cursor = start;
    while (cursor.isBefore(end)) {
      final nextDay = DateTime(cursor.year, cursor.month, cursor.day + 1);
      final segmentEnd = end.isBefore(nextDay) ? end : nextDay;
      final dayKey = _dateOnly(cursor);
      final minutes = segmentEnd.difference(cursor).inSeconds / 60;
      daily[dayKey] = (daily[dayKey] ?? 0) + minutes;
      cursor = segmentEnd;
    }
  }
}

class AdminFalconLogsScreen extends StatelessWidget {
  const AdminFalconLogsScreen({super.key, required this.controller});

  final FalconAppController controller;

  @override
  Widget build(BuildContext context) {
    final currentUser = controller.currentUser;
    final isAdmin = currentUser?.role == UserRole.manager;
    if (!isAdmin) {
      return Scaffold(
        appBar: AppBar(title: const Text('Admin Falcon Logs')),
        body: const Center(
          child: Text(
            'Admin access only.',
            style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700),
          ),
        ),
      );
    }

    final handlers = controller.handlers;
    return Scaffold(
      appBar: AppBar(title: const Text('Admin Falcon Logs')),
      body: ListView(
        padding: const EdgeInsets.all(12),
        children: [
          const Text(
            'Individual Falcon Log (Spreadsheet View)',
            style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800),
          ),
          const SizedBox(height: 8),
          ...handlers.map((handler) {
            final userSessions = controller.data.sessions
                .where((session) => session.handlerId == handler.id)
                .toList();
            final falconIds = userSessions.map((s) => s.falconId).toSet();
            final userFalcons = controller.falcons
                .where((falcon) => falconIds.contains(falcon.id))
                .toList();
            userFalcons.sort((a, b) => a.name.compareTo(b.name));
            return Card(
              margin: const EdgeInsets.only(bottom: 10),
              child: ExpansionTile(
                title: Text(
                  handler.name,
                  style: const TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.w800,
                  ),
                ),
                childrenPadding: const EdgeInsets.fromLTRB(10, 0, 10, 10),
                children: [
                  if (userFalcons.isEmpty)
                    const Padding(
                      padding: EdgeInsets.only(bottom: 8),
                      child: Align(
                        alignment: Alignment.centerLeft,
                        child: Text('No falcon sessions for this user yet.'),
                      ),
                    )
                  else
                    ...userFalcons.map((falcon) {
                      final sessions = userSessions
                          .where((session) => session.falconId == falcon.id)
                          .toList();
                      sessions.sort((a, b) => b.startAt.compareTo(a.startAt));
                      return Padding(
                        padding: const EdgeInsets.only(bottom: 12),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              falcon.name,
                              style: const TextStyle(
                                fontSize: 15,
                                fontWeight: FontWeight.w800,
                              ),
                            ),
                            const SizedBox(height: 6),
                            if (sessions.isEmpty)
                              const Text('No sessions logged.')
                            else
                              SingleChildScrollView(
                                scrollDirection: Axis.horizontal,
                                child: DataTable(
                                  columnSpacing: 14,
                                  headingRowColor: WidgetStateProperty.all(
                                    const Color(0xFFF3F4F6),
                                  ),
                                  columns: const [
                                    DataColumn(label: Text('Date/Time')),
                                    DataColumn(label: Text('Field')),
                                    DataColumn(label: Text('Session (h)')),
                                    DataColumn(label: Text('Flying (h)')),
                                    DataColumn(label: Text('Sitting (h)')),
                                    DataColumn(label: Text('Weight (g)')),
                                    DataColumn(label: Text('Food Plan (g)')),
                                    DataColumn(label: Text('Food Used (g)')),
                                    DataColumn(label: Text('Remaining (g)')),
                                    DataColumn(label: Text('Starlings')),
                                    DataColumn(label: Text('Catch')),
                                    DataColumn(label: Text('Chase')),
                                    DataColumn(label: Text('Ignore')),
                                    DataColumn(label: Text('Max Alt')),
                                    DataColumn(label: Text('Max Speed')),
                                    DataColumn(label: Text('Telemetry')),
                                  ],
                                  rows: sessions.map((session) {
                                    final field = controller.fieldById(
                                      session.fieldId,
                                    );
                                    final catches = controller
                                        .pursuitOutcomeCount(
                                          session,
                                          PursuitOutcome.kill,
                                        );
                                    return DataRow(
                                      cells: [
                                        DataCell(
                                          Text(
                                            DateFormat(
                                              'M/d/yyyy h:mm a',
                                            ).format(session.startAt),
                                          ),
                                        ),
                                        DataCell(Text(field.name)),
                                        DataCell(
                                          Text(
                                            (controller.sessionMinutes(
                                                      session,
                                                    ) /
                                                    60)
                                                .toStringAsFixed(1),
                                          ),
                                        ),
                                        DataCell(
                                          Text(
                                            (controller.flyingMinutes(session) /
                                                    60)
                                                .toStringAsFixed(1),
                                          ),
                                        ),
                                        DataCell(
                                          Text(
                                            (controller.sittingMinutes(
                                                      session,
                                                    ) /
                                                    60)
                                                .toStringAsFixed(1),
                                          ),
                                        ),
                                        DataCell(
                                          Text(
                                            session.falconWeightG
                                                .toStringAsFixed(1),
                                          ),
                                        ),
                                        DataCell(
                                          Text('${session.plannedFoodG}'),
                                        ),
                                        DataCell(
                                          Text(
                                            '${controller.foodUsedG(session)}',
                                          ),
                                        ),
                                        DataCell(
                                          Text(
                                            '${controller.foodRemainingG(session)}',
                                          ),
                                        ),
                                        DataCell(
                                          Text(
                                            '${controller.totalStarlingCount(session)}',
                                          ),
                                        ),
                                        DataCell(Text('$catches')),
                                        DataCell(
                                          Text(
                                            '${controller.pursuitOutcomeCount(session, PursuitOutcome.chase)}',
                                          ),
                                        ),
                                        DataCell(
                                          Text(
                                            '${controller.pursuitOutcomeCount(session, PursuitOutcome.ignore)}',
                                          ),
                                        ),
                                        DataCell(
                                          Text(
                                            session.maxAltitudeFt == null
                                                ? '-'
                                                : session.maxAltitudeFt!
                                                      .toStringAsFixed(0),
                                          ),
                                        ),
                                        DataCell(
                                          Text(
                                            session.maxSpeedMph == null
                                                ? '-'
                                                : session.maxSpeedMph!
                                                      .toStringAsFixed(1),
                                          ),
                                        ),
                                        DataCell(
                                          Text(
                                            session.telemetryWorking
                                                ? 'Yes'
                                                : 'No',
                                          ),
                                        ),
                                      ],
                                    );
                                  }).toList(),
                                ),
                              ),
                          ],
                        ),
                      );
                    }),
                ],
              ),
            );
          }),
        ],
      ),
    );
  }
}

class PatrolWithoutFalconSummaryScreen extends StatefulWidget {
  const PatrolWithoutFalconSummaryScreen({super.key, required this.controller});

  final FalconAppController controller;

  @override
  State<PatrolWithoutFalconSummaryScreen> createState() =>
      _PatrolWithoutFalconSummaryScreenState();
}

class _PatrolWithoutFalconSummaryScreenState
    extends State<PatrolWithoutFalconSummaryScreen> {
  FlightHoursView _view = FlightHoursView.monthly;
  late DateTime _monthAnchor;
  late DateTime _weekAnchor;

  @override
  void initState() {
    super.initState();
    final today = _dateOnly(DateTime.now());
    _monthAnchor = DateTime(today.year, today.month, 1);
    _weekAnchor = _weekStart(today);
  }

  @override
  Widget build(BuildContext context) {
    final entries = widget.controller.currentUserPatrolWithoutFalconEntries;
    final dailyMinutes = _aggregateDailyPatrolMinutes(entries);
    final sortedDays = dailyMinutes.keys.toList()..sort();
    final totalMinutes = dailyMinutes.values.fold<double>(
      0,
      (sum, value) => sum + value,
    );
    final activeMinutes = _view == FlightHoursView.monthly
        ? _monthlyMinutes(dailyMinutes, _monthAnchor)
        : _weeklyMinutes(dailyMinutes, _weekAnchor);
    return Scaffold(
      appBar: AppBar(title: const Text('Patrol Without Falcon Time')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Card(
            color: const Color(0xFFE8F0FF),
            child: Padding(
              padding: const EdgeInsets.all(12),
              child: Wrap(
                spacing: 10,
                runSpacing: 6,
                children: [
                  _summaryMetric('All-time patrol', _hoursLabel(totalMinutes)),
                  _summaryMetric(
                    'Patrol days',
                    '${dailyMinutes.entries.where((e) => e.value > 0).length}',
                  ),
                  _summaryMetric(
                    _view == FlightHoursView.monthly
                        ? 'This month'
                        : 'This week',
                    _hoursLabel(activeMinutes),
                  ),
                  _summaryMetric(
                    'Range',
                    sortedDays.isEmpty
                        ? '-'
                        : '${DateFormat('MMM d, yyyy').format(sortedDays.first)} to ${DateFormat('MMM d, yyyy').format(sortedDays.last)}',
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 10),
          SegmentedButton<FlightHoursView>(
            segments: const [
              ButtonSegment(
                value: FlightHoursView.weekly,
                label: Text('Weekly'),
              ),
              ButtonSegment(
                value: FlightHoursView.monthly,
                label: Text('Monthly'),
              ),
            ],
            selected: {_view},
            onSelectionChanged: (selected) {
              setState(() => _view = selected.first);
            },
            showSelectedIcon: false,
          ),
          const SizedBox(height: 10),
          if (dailyMinutes.isEmpty)
            const Card(
              child: Padding(
                padding: EdgeInsets.all(12),
                child: Text('No patrol-without-falcon data yet.'),
              ),
            )
          else if (_view == FlightHoursView.weekly)
            _buildWeeklyView(dailyMinutes)
          else
            _buildMonthlyView(dailyMinutes),
        ],
      ),
    );
  }

  Widget _summaryMetric(String label, String value) {
    return RichText(
      text: TextSpan(
        style: const TextStyle(color: Colors.black87),
        children: [
          TextSpan(
            text: '$label: ',
            style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 12),
          ),
          TextSpan(text: value, style: const TextStyle(fontSize: 12)),
        ],
      ),
    );
  }

  Widget _buildWeeklyView(Map<DateTime, double> dailyMinutes) {
    final maxMinutes = _maxWeekMinutes(dailyMinutes, _weekAnchor);
    final weekEnd = _weekAnchor.add(const Duration(days: 6));

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(10),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                IconButton(
                  onPressed: () {
                    setState(() {
                      _weekAnchor = _weekAnchor.subtract(
                        const Duration(days: 7),
                      );
                    });
                  },
                  icon: const Icon(Icons.chevron_left),
                ),
                Expanded(
                  child: Text(
                    '${DateFormat('MMM d').format(_weekAnchor)} - ${DateFormat('MMM d, yyyy').format(weekEnd)}',
                    textAlign: TextAlign.center,
                    style: const TextStyle(
                      fontWeight: FontWeight.w700,
                      fontSize: 13,
                    ),
                  ),
                ),
                IconButton(
                  onPressed: () {
                    setState(() {
                      _weekAnchor = _weekAnchor.add(const Duration(days: 7));
                    });
                  },
                  icon: const Icon(Icons.chevron_right),
                ),
              ],
            ),
            const SizedBox(height: 4),
            ...List.generate(7, (offset) {
              final day = _weekAnchor.add(Duration(days: offset));
              final key = _dateOnly(day);
              final minutes = dailyMinutes[key] ?? 0;
              final ratio = maxMinutes <= 0 ? 0.0 : (minutes / maxMinutes);
              return Padding(
                padding: const EdgeInsets.symmetric(vertical: 4),
                child: Row(
                  children: [
                    SizedBox(
                      width: 92,
                      child: Text(
                        '${DateFormat('EEE').format(day)} ${DateFormat('M/d').format(day)}',
                        style: const TextStyle(fontSize: 12),
                      ),
                    ),
                    Expanded(
                      child: ClipRRect(
                        borderRadius: BorderRadius.circular(8),
                        child: LinearProgressIndicator(
                          value: ratio,
                          minHeight: 10,
                          backgroundColor: const Color(0xFFE5E7EB),
                          color: const Color(0xFF0D47A1),
                        ),
                      ),
                    ),
                    const SizedBox(width: 8),
                    SizedBox(
                      width: 58,
                      child: Text(
                        _hoursShort(minutes),
                        textAlign: TextAlign.right,
                        style: const TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                  ],
                ),
              );
            }),
          ],
        ),
      ),
    );
  }

  Widget _buildMonthlyView(Map<DateTime, double> dailyMinutes) {
    final monthStart = DateTime(_monthAnchor.year, _monthAnchor.month, 1);
    final monthEnd = DateTime(_monthAnchor.year, _monthAnchor.month + 1, 0);
    final leading = monthStart.weekday - 1;
    final totalCells = ((leading + monthEnd.day + 6) ~/ 7) * 7;
    const dayLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(10),
        child: Column(
          children: [
            Row(
              children: [
                IconButton(
                  onPressed: () {
                    setState(() {
                      _monthAnchor = DateTime(
                        _monthAnchor.year,
                        _monthAnchor.month - 1,
                        1,
                      );
                    });
                  },
                  icon: const Icon(Icons.chevron_left),
                ),
                Expanded(
                  child: Text(
                    DateFormat('MMMM yyyy').format(_monthAnchor),
                    textAlign: TextAlign.center,
                    style: const TextStyle(
                      fontWeight: FontWeight.w700,
                      fontSize: 14,
                    ),
                  ),
                ),
                IconButton(
                  onPressed: () {
                    setState(() {
                      _monthAnchor = DateTime(
                        _monthAnchor.year,
                        _monthAnchor.month + 1,
                        1,
                      );
                    });
                  },
                  icon: const Icon(Icons.chevron_right),
                ),
              ],
            ),
            const SizedBox(height: 4),
            Row(
              children: dayLabels
                  .map(
                    (label) => Expanded(
                      child: Text(
                        label,
                        textAlign: TextAlign.center,
                        style: const TextStyle(
                          fontSize: 11,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                  )
                  .toList(),
            ),
            const SizedBox(height: 6),
            GridView.builder(
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                crossAxisCount: 7,
                mainAxisSpacing: 4,
                crossAxisSpacing: 4,
                childAspectRatio: 0.88,
              ),
              itemCount: totalCells,
              itemBuilder: (context, index) {
                final dayNumber = index - leading + 1;
                if (dayNumber < 1 || dayNumber > monthEnd.day) {
                  return Container(
                    decoration: BoxDecoration(
                      color: const Color(0xFFF3F4F6),
                      borderRadius: BorderRadius.circular(8),
                    ),
                  );
                }

                final day = DateTime(
                  _monthAnchor.year,
                  _monthAnchor.month,
                  dayNumber,
                );
                final minutes = dailyMinutes[_dateOnly(day)] ?? 0;
                final ratio = (minutes / 240).clamp(0.0, 1.0);
                final bg = Color.lerp(
                  const Color(0xFFF4F7FF),
                  const Color(0xFF96C0FF),
                  ratio,
                )!;

                return Container(
                  decoration: BoxDecoration(
                    color: bg,
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(color: const Color(0xFFCBD5E1)),
                  ),
                  padding: const EdgeInsets.fromLTRB(4, 4, 4, 3),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        '$dayNumber',
                        style: const TextStyle(
                          fontSize: 11,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                      const Spacer(),
                      Text(
                        _hoursShort(minutes),
                        style: const TextStyle(
                          fontSize: 10.5,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ],
                  ),
                );
              },
            ),
            const SizedBox(height: 8),
            const Align(
              alignment: Alignment.centerLeft,
              child: Text(
                'Darker blue means more patrol-without-falcon time on that day.',
                style: TextStyle(fontSize: 11, color: Colors.black54),
              ),
            ),
          ],
        ),
      ),
    );
  }

  double _maxWeekMinutes(
    Map<DateTime, double> dailyMinutes,
    DateTime weekStart,
  ) {
    var maxValue = 0.0;
    for (var i = 0; i < 7; i++) {
      final day = _dateOnly(weekStart.add(Duration(days: i)));
      final value = dailyMinutes[day] ?? 0;
      if (value > maxValue) {
        maxValue = value;
      }
    }
    return maxValue <= 0 ? 1 : maxValue;
  }

  double _weeklyMinutes(
    Map<DateTime, double> dailyMinutes,
    DateTime weekStart,
  ) {
    var total = 0.0;
    for (var i = 0; i < 7; i++) {
      total += dailyMinutes[_dateOnly(weekStart.add(Duration(days: i)))] ?? 0;
    }
    return total;
  }

  double _monthlyMinutes(Map<DateTime, double> dailyMinutes, DateTime month) {
    final monthStart = DateTime(month.year, month.month, 1);
    final monthEnd = DateTime(month.year, month.month + 1, 0);
    var total = 0.0;
    for (var day = 1; day <= monthEnd.day; day++) {
      total +=
          dailyMinutes[DateTime(monthStart.year, monthStart.month, day)] ?? 0;
    }
    return total;
  }

  DateTime _weekStart(DateTime date) {
    final day = _dateOnly(date);
    return day.subtract(Duration(days: day.weekday - 1));
  }

  DateTime _dateOnly(DateTime value) {
    return DateTime(value.year, value.month, value.day);
  }

  String _hoursLabel(double minutes) {
    return '${(minutes / 60).toStringAsFixed(1)}h';
  }

  String _hoursShort(double minutes) {
    if (minutes <= 0) {
      return '0h';
    }
    return '${(minutes / 60).toStringAsFixed(1)}h';
  }

  Map<DateTime, double> _aggregateDailyPatrolMinutes(
    List<PatrolWithoutFalconEntry> entries,
  ) {
    final daily = <DateTime, double>{};
    for (final entry in entries) {
      final end = entry.endAt ?? DateTime.now();
      _addInterval(daily, entry.startAt, end);
    }
    return daily;
  }

  void _addInterval(Map<DateTime, double> daily, DateTime start, DateTime end) {
    if (!end.isAfter(start)) {
      return;
    }
    var cursor = start;
    while (cursor.isBefore(end)) {
      final nextDay = DateTime(cursor.year, cursor.month, cursor.day + 1);
      final segmentEnd = end.isBefore(nextDay) ? end : nextDay;
      final dayKey = _dateOnly(cursor);
      final minutes = segmentEnd.difference(cursor).inSeconds / 60;
      daily[dayKey] = (daily[dayKey] ?? 0) + minutes;
      cursor = segmentEnd;
    }
  }
}

class AskQuestionScreen extends StatefulWidget {
  const AskQuestionScreen({super.key, required this.controller});

  final FalconAppController controller;

  @override
  State<AskQuestionScreen> createState() => _AskQuestionScreenState();
}

class _AskQuestionScreenState extends State<AskQuestionScreen> {
  final _questionController = TextEditingController();
  final SpeechToText _speech = SpeechToText();
  bool _speechReady = false;
  bool _recordingQuestion = false;
  bool _sending = false;

  @override
  void initState() {
    super.initState();
    unawaited(_initSpeech());
  }

  Future<void> _initSpeech() async {
    final available = await _speech.initialize(
      onStatus: (status) {
        if (!mounted) {
          return;
        }
        if (status == 'listening') {
          setState(() => _recordingQuestion = true);
        } else if (status == 'notListening' || status == 'done') {
          setState(() => _recordingQuestion = false);
        }
      },
      onError: (_) {
        if (!mounted) {
          return;
        }
        setState(() => _recordingQuestion = false);
      },
    );
    if (!mounted) {
      return;
    }
    setState(() => _speechReady = available);
  }

  @override
  void dispose() {
    if (_recordingQuestion) {
      _speech.stop();
    }
    _questionController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: widget.controller,
      builder: (context, _) {
        final questions = widget.controller.currentUserQuestions;
        return Scaffold(
          appBar: AppBar(title: const Text('Ask a Question')),
          body: ListView(
            padding: const EdgeInsets.all(16),
            children: [
              const Text(
                'Type your question and send it as text. A check mark appears once the question has been answered.',
                style: TextStyle(fontSize: 12, color: Colors.black54),
              ),
              const SizedBox(height: 10),
              TextField(
                controller: _questionController,
                minLines: 2,
                maxLines: 4,
                decoration: const InputDecoration(
                  border: OutlineInputBorder(),
                  labelText: 'Enter your question',
                ),
              ),
              const SizedBox(height: 8),
              Row(
                children: [
                  Expanded(
                    child: FilledButton.tonalIcon(
                      onPressed: (!_speechReady || _sending)
                          ? null
                          : _toggleQuestionRecording,
                      icon: Icon(_recordingQuestion ? Icons.stop : Icons.mic),
                      label: Text(
                        _recordingQuestion
                            ? 'Stop Voice Recording'
                            : 'Record Voice Question',
                      ),
                    ),
                  ),
                ],
              ),
              if (!_speechReady)
                const Padding(
                  padding: EdgeInsets.only(top: 8),
                  child: Text(
                    'Speech service unavailable on this device.',
                    style: TextStyle(fontSize: 12, color: Color(0xFF842029)),
                  ),
                ),
              const SizedBox(height: 8),
              FilledButton.icon(
                onPressed: _sending ? null : _sendQuestion,
                icon: const Icon(Icons.send),
                label: Text(_sending ? 'Sending...' : 'Send Question as Text'),
              ),
              const SizedBox(height: 12),
              if (questions.isEmpty)
                const Card(
                  child: Padding(
                    padding: EdgeInsets.all(12),
                    child: Text('No questions sent yet.'),
                  ),
                )
              else
                ...questions.map((question) {
                  final answered = question.isAnswered;
                  return Card(
                    child: ListTile(
                      title: Text(question.questionText),
                      subtitle: Text(
                        answered
                            ? '${_fmtDate(question.askedAt)} · The question has been answered.'
                            : '${_fmtDate(question.askedAt)} · Awaiting answer...',
                      ),
                      trailing: answered
                          ? const Icon(
                              Icons.check_circle,
                              color: Color(0xFF1E5E2D),
                            )
                          : const Icon(Icons.schedule),
                    ),
                  );
                }),
            ],
          ),
        );
      },
    );
  }

  Future<void> _toggleQuestionRecording() async {
    if (_recordingQuestion) {
      await _speech.stop();
      if (!mounted) {
        return;
      }
      setState(() => _recordingQuestion = false);
      return;
    }

    final ok = await _speech.listen(
      onResult: (result) {
        if (!mounted) {
          return;
        }
        _questionController.text = result.recognizedWords;
        _questionController.selection = TextSelection.fromPosition(
          TextPosition(offset: _questionController.text.length),
        );
      },
    );

    if (!mounted) {
      return;
    }
    setState(() => _recordingQuestion = ok);
  }

  Future<void> _sendQuestion() async {
    final text = _questionController.text.trim();
    if (text.isEmpty) {
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(const SnackBar(content: Text('Enter a question first.')));
      return;
    }
    if (_recordingQuestion) {
      await _speech.stop();
      _recordingQuestion = false;
    }
    setState(() => _sending = true);
    try {
      final question = await widget.controller.submitQuestion(text);
      if (!mounted) {
        return;
      }
      _questionController.clear();
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(const SnackBar(content: Text('Question sent as text.')));
      unawaited(_simulateAnswer(question.id));
    } catch (error) {
      if (!mounted) {
        return;
      }
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text(error.toString())));
    } finally {
      if (mounted) {
        setState(() => _sending = false);
      }
    }
  }

  Future<void> _simulateAnswer(String questionId) async {
    await Future<void>.delayed(const Duration(seconds: 3));
    try {
      await widget.controller.markQuestionAnswered(questionId: questionId);
    } catch (_) {}
  }
}

class CustomerInputScreen extends StatefulWidget {
  const CustomerInputScreen({super.key, required this.controller});

  final FalconAppController controller;

  @override
  State<CustomerInputScreen> createState() => _CustomerInputScreenState();
}

class _CustomerInputScreenState extends State<CustomerInputScreen> {
  final SpeechToText _speech = SpeechToText();
  bool _speechReady = false;
  bool _recording = false;
  bool _saving = false;
  String _liveTranscript = '';

  @override
  void initState() {
    super.initState();
    unawaited(_initSpeech());
  }

  Future<void> _initSpeech() async {
    final available = await _speech.initialize(
      onStatus: (status) {
        if (!mounted) {
          return;
        }
        if (status == 'listening') {
          setState(() => _recording = true);
        } else if (status == 'notListening' || status == 'done') {
          setState(() => _recording = false);
        }
      },
      onError: (_) {
        if (!mounted) {
          return;
        }
        setState(() => _recording = false);
      },
    );
    if (!mounted) {
      return;
    }
    setState(() => _speechReady = available);
  }

  @override
  void dispose() {
    if (_recording) {
      _speech.stop();
    }
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: widget.controller,
      builder: (context, _) {
        final entries = widget.controller.currentUserCustomerInputs;
        return Scaffold(
          appBar: AppBar(title: const Text('Customer Input')),
          body: ListView(
            padding: const EdgeInsets.all(16),
            children: [
              const Text(
                'Use Start Recording and Stop Recording to capture a conversation summary. It will be date and time stamped automatically.',
                style: TextStyle(fontSize: 12, color: Colors.black54),
              ),
              const SizedBox(height: 10),
              Row(
                children: [
                  Expanded(
                    child: FilledButton.icon(
                      onPressed: (!_speechReady || _saving || _recording)
                          ? null
                          : _startRecording,
                      icon: const Icon(Icons.mic),
                      label: const Text('Start Recording'),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: FilledButton.icon(
                      style: FilledButton.styleFrom(
                        backgroundColor: const Color(0xFFC92A2A),
                        foregroundColor: Colors.white,
                      ),
                      onPressed:
                          (!_speechReady ||
                              _saving ||
                              (!_recording && _liveTranscript.trim().isEmpty))
                          ? null
                          : _stopAndSave,
                      icon: const Icon(Icons.stop),
                      label: const Text('Stop Recording'),
                    ),
                  ),
                ],
              ),
              if (!_speechReady)
                const Padding(
                  padding: EdgeInsets.only(top: 8),
                  child: Text(
                    'Speech service unavailable on this device.',
                    style: TextStyle(fontSize: 12, color: Color(0xFF842029)),
                  ),
                ),
              if (_recording || _liveTranscript.trim().isNotEmpty) ...[
                const SizedBox(height: 10),
                Card(
                  child: Padding(
                    padding: const EdgeInsets.all(10),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          _recording
                              ? 'Recording in progress...'
                              : 'Latest transcript',
                          style: const TextStyle(
                            fontWeight: FontWeight.w700,
                            fontSize: 12,
                          ),
                        ),
                        const SizedBox(height: 6),
                        Text(
                          _liveTranscript.trim().isEmpty
                              ? 'Listening...'
                              : _liveTranscript.trim(),
                          style: const TextStyle(fontSize: 12),
                        ),
                      ],
                    ),
                  ),
                ),
              ],
              const SizedBox(height: 12),
              const Text(
                'Recorded Customer Inputs',
                style: TextStyle(fontWeight: FontWeight.w700, fontSize: 15),
              ),
              const SizedBox(height: 8),
              if (entries.isEmpty)
                const Card(
                  child: Padding(
                    padding: EdgeInsets.all(12),
                    child: Text('No customer input recordings yet.'),
                  ),
                )
              else
                ...entries.map(
                  (entry) => Card(
                    child: ListTile(
                      leading: const Icon(
                        Icons.check_circle,
                        color: Color(0xFF1E5E2D),
                      ),
                      title: Text(
                        entry.transcript,
                        maxLines: 3,
                        overflow: TextOverflow.ellipsis,
                      ),
                      subtitle: Text(_fmtDate(entry.createdAt)),
                    ),
                  ),
                ),
            ],
          ),
        );
      },
    );
  }

  Future<void> _startRecording() async {
    if (_recording || _saving) {
      return;
    }
    setState(() {
      _liveTranscript = '';
    });
    final ok = await _speech.listen(
      onResult: (result) {
        if (!mounted) {
          return;
        }
        setState(() {
          _liveTranscript = result.recognizedWords;
        });
      },
    );
    if (!mounted) {
      return;
    }
    setState(() => _recording = ok);
    if (!ok) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Unable to start recording.')),
      );
    }
  }

  Future<void> _stopAndSave() async {
    if (_saving) {
      return;
    }
    final transcriptBeforeStop = _liveTranscript.trim();
    setState(() {
      _recording = false;
      _saving = true;
    });
    try {
      await _speech.stop();
    } catch (_) {}
    for (var attempt = 0; attempt < 10 && mounted; attempt++) {
      if (_liveTranscript.trim().isNotEmpty) {
        break;
      }
      await Future<void>.delayed(const Duration(milliseconds: 100));
    }
    if (!mounted) {
      return;
    }
    final transcript = _liveTranscript.trim().isNotEmpty
        ? _liveTranscript.trim()
        : transcriptBeforeStop;
    var saved = false;
    try {
      if (transcript.isNotEmpty) {
        await widget.controller.addCustomerInputTranscript(transcript);
        saved = true;
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text('Customer input recorded with timestamp.'),
            ),
          );
        }
      } else {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('No recording captured to save.')),
        );
      }
    } catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text(error.toString())));
      }
    } finally {
      if (mounted) {
        setState(() {
          _saving = false;
          if (saved) {
            _liveTranscript = '';
          }
        });
      }
    }
  }
}

class ReadyToFlyScreen extends StatefulWidget {
  const ReadyToFlyScreen({super.key, required this.controller});

  final FalconAppController controller;

  @override
  State<ReadyToFlyScreen> createState() => _ReadyToFlyScreenState();
}

class _ReadyToFlyScreenState extends State<ReadyToFlyScreen> {
  static const int _quailItemIndex = 3;
  static const int _telemetryItemIndex = 2;

  static const List<String> _itemTitles = [
    'ATV',
    'Falcon spray bottle',
    'Test Telemetry',
    'Falcon food',
  ];

  static const List<String> _items = [
    'Tire pressure. Gas tank is more than half full.',
    'Fresh and full.',
    'Test Falcon telemetry outside with clear southern exposure to satellites.',
    'Weigh and cut up quail, place in Falcon bag with coolant.',
  ];

  late final List<bool> _answers = List<bool>.filled(_items.length, false);
  final _quailGramsController = TextEditingController();
  final _fiveGramBreakdownController = TextEditingController();
  final _fiveGramQtyController = TextEditingController();
  final _tenGramBreakdownController = TextEditingController();
  final _tenGramQtyController = TextEditingController();
  final _pickupPieceBreakdownController = TextEditingController();
  final ScrollController _scrollController = ScrollController();
  bool _item5Transmitter1 = false;
  bool _item5Transmitter2 = false;
  bool _item5PocketLink = false;
  bool _navigating = false;

  bool get _hasValidQuailGrams {
    final grams = double.tryParse(_quailGramsController.text.trim());
    return grams != null && grams > 0;
  }

  int get _plannedFoodGFromChecklist =>
      double.parse(_quailGramsController.text.trim()).round();

  int? get _smallTidbitGrams =>
      _parseNonNegativeInt(_fiveGramBreakdownController.text);
  int? get _smallTidbitQty => _parseNonNegativeInt(_fiveGramQtyController.text);
  int? get _largeTidbitGrams =>
      _parseNonNegativeInt(_tenGramBreakdownController.text);
  int? get _largeTidbitQty => _parseNonNegativeInt(_tenGramQtyController.text);
  int? get _pickupPieceBreakdownG =>
      _parseNonNegativeInt(_pickupPieceBreakdownController.text);

  int get _smallTidbitTotal =>
      (_smallTidbitGrams ?? 0) * (_smallTidbitQty ?? 0);
  int get _largeTidbitTotal =>
      (_largeTidbitGrams ?? 0) * (_largeTidbitQty ?? 0);

  bool get _hasValidBreakdownInputs =>
      _smallTidbitGrams != null &&
      _smallTidbitQty != null &&
      _largeTidbitGrams != null &&
      _largeTidbitQty != null &&
      _pickupPieceBreakdownG != null;

  int get _pickupPieceCalculatedG {
    if (!_hasValidQuailGrams) {
      return 0;
    }
    final remainder =
        _plannedFoodGFromChecklist - (_smallTidbitTotal + _largeTidbitTotal);
    return remainder < 0 ? 0 : remainder;
  }

  int get _pickupPieceTargetG {
    if (!_hasValidQuailGrams) {
      return 0;
    }
    return (_plannedFoodGFromChecklist / 3).round();
  }

  bool get _quailBreakdownComplete =>
      _hasValidQuailGrams && _hasValidBreakdownInputs;

  bool get _item5Complete =>
      _item5Transmitter1 && _item5Transmitter2 && _item5PocketLink;

  bool get _isChecklistComplete {
    final coreItemsComplete = _answers
        .asMap()
        .entries
        .where(
          (entry) =>
              entry.key != _telemetryItemIndex && entry.key != _quailItemIndex,
        )
        .every((entry) => entry.value);
    return coreItemsComplete &&
        _item5Complete &&
        _hasValidQuailGrams &&
        _quailBreakdownComplete;
  }

  _FeedWindowSummary _feedWindowSummary({
    required String falconId,
    required DateTime fromInclusive,
    required DateTime toExclusive,
  }) {
    double totalFed = 0;
    for (final session in widget.controller.currentUserSessions) {
      if (session.falconId != falconId) {
        continue;
      }
      for (final event in session.events) {
        if (event.type != SessionEventType.reward) {
          continue;
        }
        if (event.at.isBefore(fromInclusive) ||
            !event.at.isBefore(toExclusive)) {
          continue;
        }
        totalFed += (event.rewardG ?? 0).toDouble();
      }
    }

    final userId = widget.controller.currentUser?.id;
    if (userId != null) {
      for (final feed in widget.controller.data.supplementalFeeds) {
        if (feed.handlerId != userId || feed.falconId != falconId) {
          continue;
        }
        if (feed.at.isBefore(fromInclusive) || !feed.at.isBefore(toExclusive)) {
          continue;
        }
        totalFed += feed.grams;
      }
    }

    final sessionsInWindow =
        widget.controller.currentUserSessions
            .where(
              (session) =>
                  session.falconId == falconId &&
                  session.endAt != null &&
                  !session.endAt!.isBefore(fromInclusive) &&
                  session.endAt!.isBefore(toExclusive),
            )
            .toList()
          ..sort((a, b) => b.endAt!.compareTo(a.endAt!));

    DesiredWeightTrend? desiredTrend;
    for (final session in sessionsInWindow) {
      if (session.desiredWeight != null) {
        desiredTrend = session.desiredWeight;
        break;
      }
    }

    return _FeedWindowSummary(
      totalFedG: totalFed.round(),
      desiredWeight: desiredTrend,
    );
  }

  Widget _historicalFeedSummaryCard({bool rightAligned = false}) {
    final falcons = widget.controller.falcons.take(3).toList();
    if (falcons.isEmpty) {
      return const SizedBox.shrink();
    }
    final now = DateTime.now();
    final start24 = now.subtract(const Duration(hours: 24));
    final start48 = now.subtract(const Duration(hours: 48));
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: falcons.map((falcon) {
        final summary48 = _feedWindowSummary(
          falconId: falcon.id,
          fromInclusive: start48,
          toExclusive: start24,
        );
        final summary24 = _feedWindowSummary(
          falconId: falcon.id,
          fromInclusive: start24,
          toExclusive: now,
        );
        return Container(
          margin: const EdgeInsets.only(bottom: 4),
          padding: EdgeInsets.all(rightAligned ? 5 : 8),
          decoration: BoxDecoration(
            color: const Color(0xFFFFF59D),
            borderRadius: BorderRadius.circular(10),
            border: Border.all(color: const Color(0xFFCBD5E1)),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                '${falcon.name.toUpperCase()} FEED HISTORY',
                style: TextStyle(
                  fontSize: rightAligned ? 10.6 : 11.2,
                  fontWeight: FontWeight.w800,
                  color: const Color(0xFF0F172A),
                ),
              ),
              const SizedBox(height: 3),
              _feedHistoryLine(label: '24 hours ago', summary: summary24),
              const SizedBox(height: 3),
              _feedHistoryLine(label: '48 hours ago', summary: summary48),
            ],
          ),
        );
      }).toList(),
    );
  }

  Widget _feedHistoryLine({
    required String label,
    required _FeedWindowSummary summary,
  }) {
    final desired = _desiredWeightLabel(summary.desiredWeight);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          '$label: ${summary.totalFedG}g  $desired',
          style: const TextStyle(
            fontSize: 9.2,
            fontWeight: FontWeight.w700,
            color: Color(0xFF1F2937),
          ),
        ),
      ],
    );
  }

  @override
  void initState() {
    super.initState();
    _answers[0] = true;
    _answers[1] = true;
  }

  @override
  void dispose() {
    _quailGramsController.dispose();
    _fiveGramBreakdownController.dispose();
    _fiveGramQtyController.dispose();
    _tenGramBreakdownController.dispose();
    _tenGramQtyController.dispose();
    _pickupPieceBreakdownController.dispose();
    _scrollController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Ready to Fly')),
      body: GestureDetector(
        onHorizontalDragEnd: (details) {
          if (details.primaryVelocity != null &&
              details.primaryVelocity! < -350) {
            _openLocalWeather();
          }
        },
        child: ListView(
          controller: _scrollController,
          padding: const EdgeInsets.fromLTRB(10, 8, 10, 8),
          children: [
            const Text(
              'Checklist',
              style: TextStyle(fontWeight: FontWeight.w700, fontSize: 14),
            ),
            const SizedBox(height: 6),
            ...List.generate(_items.length, (index) {
              return Card(
                margin: const EdgeInsets.only(bottom: 4),
                child: Padding(
                  padding: const EdgeInsets.all(6),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  '${index + 1}. ${_itemTitles[index]}',
                                  style: const TextStyle(
                                    fontWeight: FontWeight.w800,
                                    fontSize: 11.2,
                                  ),
                                ),
                                const SizedBox(height: 1),
                                Text(
                                  _items[index],
                                  style: const TextStyle(
                                    fontWeight: FontWeight.w600,
                                    fontSize: 10.2,
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ],
                      ),
                      if (index == _telemetryItemIndex) ...[
                        const SizedBox(height: 5),
                        Row(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const Expanded(
                              child: Text(
                                'PocketLink connected to AeroVision app.',
                                style: TextStyle(fontSize: 10.2),
                              ),
                            ),
                            const SizedBox(width: 8),
                            _YesNoToggle(
                              value: _item5PocketLink,
                              compact: true,
                              onChanged: (value) => _onItem5Answer(
                                item: _Item5SubQuestion.pocketLink,
                                value: value,
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 4),
                        Row(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const Expanded(
                              child: Text(
                                'Transmitter 1 connected to satellite?',
                                style: TextStyle(fontSize: 10.3),
                              ),
                            ),
                            const SizedBox(width: 8),
                            _YesNoToggle(
                              value: _item5Transmitter1,
                              compact: true,
                              onChanged: (value) => _onItem5Answer(
                                item: _Item5SubQuestion.tx1,
                                value: value,
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 4),
                        Row(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const Expanded(
                              child: Text(
                                'Transmitter 2 connected to satellite?',
                                style: TextStyle(fontSize: 10.3),
                              ),
                            ),
                            const SizedBox(width: 8),
                            _YesNoToggle(
                              value: _item5Transmitter2,
                              compact: true,
                              onChanged: (value) => _onItem5Answer(
                                item: _Item5SubQuestion.tx2,
                                value: value,
                              ),
                            ),
                          ],
                        ),
                      ],
                      if (index == _quailItemIndex) ...[
                        const SizedBox(height: 5),
                        const Text(
                          'Total amount of food fed to falcon',
                          style: TextStyle(
                            fontSize: 10.8,
                            fontWeight: FontWeight.w800,
                            color: Color(0xFF1F2937),
                          ),
                        ),
                        const SizedBox(height: 2),
                        Align(
                          alignment: Alignment.centerLeft,
                          child: SizedBox(
                            width: 72,
                            child: TextField(
                              controller: _quailGramsController,
                              keyboardType: TextInputType.number,
                              textAlign: TextAlign.center,
                              maxLength: 3,
                              inputFormatters: [
                                FilteringTextInputFormatter.digitsOnly,
                                LengthLimitingTextInputFormatter(3),
                              ],
                              onChanged: _onQuailGramsChanged,
                              decoration: const InputDecoration(
                                border: OutlineInputBorder(),
                                hintText: 'g',
                                counterText: '',
                                isDense: true,
                                contentPadding: EdgeInsets.symmetric(
                                  horizontal: 6,
                                  vertical: 8,
                                ),
                              ),
                            ),
                          ),
                        ),
                        if (!_hasValidQuailGrams)
                          const Padding(
                            padding: EdgeInsets.only(top: 4),
                            child: Text(
                              'Enter total grams of quail to continue.',
                              style: TextStyle(
                                fontSize: 10.5,
                                color: Color(0xFF842029),
                              ),
                            ),
                          ),
                        const SizedBox(height: 4),
                        Row(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Expanded(
                              child: Column(
                                children: [
                                  _breakdownInputRow(
                                    label: 'Small tidbit',
                                    gramsController:
                                        _fiveGramBreakdownController,
                                    qtyController: _fiveGramQtyController,
                                    totalText: '(${_smallTidbitTotal}g)',
                                    labelWidth: 78,
                                    gramsFieldWidth: 68,
                                    qtyFieldWidth: 54,
                                  ),
                                  const SizedBox(height: 4),
                                  _breakdownInputRow(
                                    label: 'Large tidbit',
                                    gramsController:
                                        _tenGramBreakdownController,
                                    qtyController: _tenGramQtyController,
                                    totalText: '(${_largeTidbitTotal}g)',
                                    labelWidth: 78,
                                    gramsFieldWidth: 68,
                                    qtyFieldWidth: 54,
                                  ),
                                  const SizedBox(height: 10),
                                  _breakdownInputRow(
                                    label: 'Pickup piece (grams)',
                                    gramsController:
                                        _pickupPieceBreakdownController,
                                    readOnly: true,
                                    labelWidth: 98,
                                    singleLineLabel: true,
                                    gramsFieldWidth: 136,
                                    totalText: _hasValidQuailGrams
                                        ? 'Pick up piece target amount in grams: ${_pickupPieceTargetG}g'
                                        : 'Pick up piece target amount in grams: --',
                                    totalOnNextLine: true,
                                  ),
                                ],
                              ),
                            ),
                            const SizedBox(width: 6),
                            Transform.translate(
                              offset: const Offset(0, -56),
                              child: SizedBox(
                                width: 170,
                                child: _historicalFeedSummaryCard(
                                  rightAligned: true,
                                ),
                              ),
                            ),
                          ],
                        ),
                      ],
                    ],
                  ),
                ),
              );
            }),
            const SizedBox(height: 5),
            FilledButton(
              onPressed: _isChecklistComplete && !_navigating
                  ? _goToApproach
                  : null,
              child: const Text('Continue to Approach Falcon'),
            ),
          ],
        ),
      ),
    );
  }

  void _onItem5Answer({required _Item5SubQuestion item, required bool value}) {
    setState(() {
      switch (item) {
        case _Item5SubQuestion.tx1:
          _item5Transmitter1 = value;
          break;
        case _Item5SubQuestion.tx2:
          _item5Transmitter2 = value;
          break;
        case _Item5SubQuestion.pocketLink:
          _item5PocketLink = value;
          break;
      }
    });
  }

  void _goToApproach() {
    if (_navigating || !mounted) {
      return;
    }
    setState(() => _navigating = true);
    Navigator.of(context)
        .push(
          MaterialPageRoute(
            builder: (_) => StartSessionScreen(
              controller: widget.controller,
              plannedFoodG: _plannedFoodGFromChecklist,
              smallTidbitG: _smallTidbitGrams ?? 0,
              largeTidbitG: _largeTidbitGrams ?? 0,
              pickupPieceG: _pickupPieceBreakdownG ?? _pickupPieceCalculatedG,
              localWeather: const [],
            ),
          ),
        )
        .then((_) {
          if (mounted) {
            setState(() => _navigating = false);
          }
        });
  }

  void _openLocalWeather() {
    if (!mounted) {
      return;
    }
    Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => LocalWeatherScreen(
          controller: widget.controller,
          plannedFoodG: _hasValidQuailGrams ? _plannedFoodGFromChecklist : 0,
          smallTidbitG: _smallTidbitGrams ?? 0,
          largeTidbitG: _largeTidbitGrams ?? 0,
          pickupPieceG: _pickupPieceBreakdownG ?? _pickupPieceCalculatedG,
        ),
      ),
    );
  }

  void _onQuailGramsChanged(String _) {
    _syncPickupPieceAuto();
    setState(() {});
  }

  void _syncPickupPieceAuto() {
    if (!_hasValidQuailGrams) {
      if (_pickupPieceBreakdownController.text.isNotEmpty) {
        _pickupPieceBreakdownController.text = '';
      }
      return;
    }
    final nextValue = _pickupPieceCalculatedG.toString();
    if (_pickupPieceBreakdownController.text != nextValue) {
      _pickupPieceBreakdownController.text = nextValue;
    }
  }

  int? _parseNonNegativeInt(String value) {
    final trimmed = value.trim();
    if (trimmed.isEmpty) {
      return null;
    }
    final parsed = int.tryParse(trimmed);
    if (parsed == null || parsed < 0) {
      return null;
    }
    return parsed;
  }

  Widget _breakdownInputRow({
    required String label,
    required TextEditingController gramsController,
    TextEditingController? qtyController,
    String? totalText,
    bool readOnly = false,
    double labelWidth = 92,
    bool singleLineLabel = false,
    double gramsFieldWidth = 78,
    double qtyFieldWidth = 70,
    bool totalOnNextLine = false,
  }) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (!totalOnNextLine)
          Row(
            children: [
              SizedBox(
                width: labelWidth,
                child: Text(
                  label,
                  maxLines: singleLineLabel ? 1 : 2,
                  overflow: singleLineLabel ? TextOverflow.ellipsis : null,
                  style: const TextStyle(
                    fontSize: 10.5,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
              const SizedBox(width: 4),
              if (totalText != null)
                Flexible(
                  child: Text(
                    totalText,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      fontSize: 10,
                      fontWeight: FontWeight.w700,
                      color: Color(0xFF1E5E2D),
                    ),
                  ),
                ),
            ],
          )
        else ...[
          Text(
            label,
            maxLines: singleLineLabel ? 1 : 2,
            overflow: singleLineLabel ? TextOverflow.ellipsis : null,
            style: const TextStyle(fontSize: 10.5, fontWeight: FontWeight.w700),
          ),
          if (totalText != null)
            Padding(
              padding: const EdgeInsets.only(top: 1),
              child: Text(
                totalText,
                style: const TextStyle(
                  fontSize: 9.8,
                  fontWeight: FontWeight.w700,
                  color: Color(0xFF1E5E2D),
                ),
              ),
            ),
        ],
        const SizedBox(height: 2),
        Row(
          children: [
            SizedBox(
              width: gramsFieldWidth,
              height: 32,
              child: TextField(
                controller: gramsController,
                keyboardType: TextInputType.number,
                textAlign: TextAlign.center,
                readOnly: readOnly,
                inputFormatters: [
                  FilteringTextInputFormatter.digitsOnly,
                  LengthLimitingTextInputFormatter(3),
                ],
                onChanged: readOnly ? null : _onQuailGramsChanged,
                decoration: InputDecoration(
                  hintText: 'grams',
                  hintStyle: const TextStyle(fontSize: 8.5),
                  isDense: true,
                  filled: true,
                  fillColor: readOnly
                      ? const Color(0xFFE5E7EB)
                      : const Color(0xFFDCEBFF),
                  enabledBorder: readOnly
                      ? const OutlineInputBorder(
                          borderSide: BorderSide(color: Color(0xFF9CA3AF)),
                        )
                      : const OutlineInputBorder(
                          borderSide: BorderSide(color: Color(0xFF1E40AF)),
                        ),
                  focusedBorder: readOnly
                      ? const OutlineInputBorder(
                          borderSide: BorderSide(color: Color(0xFF9CA3AF)),
                        )
                      : const OutlineInputBorder(
                          borderSide: BorderSide(color: Color(0xFF1E3A8A)),
                        ),
                  contentPadding: EdgeInsets.symmetric(
                    horizontal: 6,
                    vertical: 8,
                  ),
                ),
                style: const TextStyle(fontSize: 10),
              ),
            ),
            if (qtyController != null) ...[
              const SizedBox(width: 6),
              SizedBox(
                width: qtyFieldWidth,
                height: 32,
                child: TextField(
                  controller: qtyController,
                  keyboardType: TextInputType.number,
                  textAlign: TextAlign.center,
                  inputFormatters: [
                    FilteringTextInputFormatter.digitsOnly,
                    LengthLimitingTextInputFormatter(3),
                  ],
                  onChanged: _onQuailGramsChanged,
                  decoration: const InputDecoration(
                    hintText: 'qty',
                    isDense: true,
                    filled: true,
                    fillColor: Color(0xFFDCEBFF),
                    enabledBorder: OutlineInputBorder(
                      borderSide: BorderSide(color: Color(0xFF1E40AF)),
                    ),
                    focusedBorder: OutlineInputBorder(
                      borderSide: BorderSide(color: Color(0xFF1E3A8A)),
                    ),
                    contentPadding: EdgeInsets.symmetric(
                      horizontal: 6,
                      vertical: 8,
                    ),
                  ),
                ),
              ),
            ],
          ],
        ),
      ],
    );
  }
}

enum _Item5SubQuestion { tx1, tx2, pocketLink }

class _FeedWindowSummary {
  const _FeedWindowSummary({
    required this.totalFedG,
    required this.desiredWeight,
  });

  final int totalFedG;
  final DesiredWeightTrend? desiredWeight;
}

class LocalWeatherScreen extends StatefulWidget {
  const LocalWeatherScreen({
    super.key,
    required this.controller,
    required this.plannedFoodG,
    required this.smallTidbitG,
    required this.largeTidbitG,
    required this.pickupPieceG,
  });

  final FalconAppController controller;
  final int plannedFoodG;
  final int smallTidbitG;
  final int largeTidbitG;
  final int pickupPieceG;

  @override
  State<LocalWeatherScreen> createState() => _LocalWeatherScreenState();
}

class _LocalWeatherScreenState extends State<LocalWeatherScreen> {
  bool _loadingLiveWeather = true;
  String? _liveWeatherError;
  double? _temperatureF;
  int? _expectedRainPercent;
  double? _windMph;
  double? _windDirectionDegrees;
  int? _cloudCoverPercent;
  double? _currentPrecipMm;
  int? _fogPercent;
  int? _smokeIndexAqi;
  bool _navigating = false;
  bool _heatPulse = false;

  @override
  void initState() {
    super.initState();
    unawaited(_loadLiveWeather());
  }

  @override
  void dispose() {
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Local Weather')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          const Text(
            'Live local weather conditions',
            style: TextStyle(fontWeight: FontWeight.w700, fontSize: 16),
          ),
          const SizedBox(height: 8),
          _liveWeatherCard(),
          const SizedBox(height: 16),
          FilledButton(
            onPressed: _navigating ? null : _goToStart,
            child: const Text('Continue to Approach Falcon'),
          ),
        ],
      ),
    );
  }

  void _goToStart() {
    if (_navigating || !mounted) {
      return;
    }
    setState(() => _navigating = true);
    Navigator.of(context)
        .push(
          MaterialPageRoute(
            builder: (_) => StartSessionScreen(
              controller: widget.controller,
              plannedFoodG: widget.plannedFoodG,
              smallTidbitG: widget.smallTidbitG,
              largeTidbitG: widget.largeTidbitG,
              pickupPieceG: widget.pickupPieceG,
              localWeather: _computedLocalWeatherTags(),
            ),
          ),
        )
        .then((_) {
          if (mounted) {
            setState(() => _navigating = false);
          }
        });
  }

  Future<void> _loadLiveWeather() async {
    if (mounted) {
      setState(() {
        _loadingLiveWeather = true;
        _liveWeatherError = null;
      });
    }

    try {
      final enabled = await Geolocator.isLocationServiceEnabled();
      if (!enabled) {
        throw StateError('Enable Location Services to load live weather.');
      }

      var permission = await Geolocator.checkPermission();
      if (permission == LocationPermission.denied) {
        permission = await Geolocator.requestPermission();
      }
      if (permission == LocationPermission.denied ||
          permission == LocationPermission.deniedForever) {
        throw StateError('Location permission is required for live weather.');
      }

      Position? position;
      try {
        position = await Geolocator.getCurrentPosition(
          locationSettings: const LocationSettings(
            accuracy: LocationAccuracy.low,
            timeLimit: Duration(seconds: 8),
          ),
        );
      } catch (_) {
        position = await Geolocator.getLastKnownPosition();
      }
      if (position == null) {
        throw StateError('Unable to read device location.');
      }

      final uri = Uri.https('api.open-meteo.com', '/v1/forecast', {
        'latitude': position.latitude.toString(),
        'longitude': position.longitude.toString(),
        'current':
            'temperature_2m,relative_humidity_2m,wind_speed_10m,wind_direction_10m,precipitation,cloud_cover',
        'hourly': 'precipitation_probability,visibility',
        'forecast_days': '1',
        'temperature_unit': 'fahrenheit',
        'wind_speed_unit': 'mph',
        'timezone': 'auto',
      });

      final response = await http.get(uri);
      if (response.statusCode != 200) {
        throw StateError(
          'Weather service unavailable (${response.statusCode}).',
        );
      }

      final decoded = jsonDecode(response.body) as Map<String, dynamic>;
      final current = decoded['current'] as Map<String, dynamic>? ?? const {};
      final hourly = decoded['hourly'] as Map<String, dynamic>? ?? const {};

      final temperature = (current['temperature_2m'] as num?)?.toDouble();
      final windSpeed = (current['wind_speed_10m'] as num?)?.toDouble();
      final windDirection = (current['wind_direction_10m'] as num?)?.toDouble();
      final cloudCover = (current['cloud_cover'] as num?)?.round();
      final precipitation = (current['precipitation'] as num?)?.toDouble();

      final rainSeries =
          (hourly['precipitation_probability'] as List<dynamic>?)
              ?.whereType<num>()
              .map((n) => n.toDouble())
              .toList() ??
          const <double>[];
      int? rainPercent;
      if (rainSeries.isNotEmpty) {
        final lookAhead = rainSeries.take(6);
        final peak = lookAhead.fold<double>(0, (maxValue, value) {
          return value > maxValue ? value : maxValue;
        });
        rainPercent = peak.round();
      }
      final visibilitySeries =
          (hourly['visibility'] as List<dynamic>?)
              ?.whereType<num>()
              .map((n) => n.toDouble())
              .toList() ??
          const <double>[];
      int? fogPercent;
      if (visibilitySeries.isNotEmpty) {
        final visibility = visibilitySeries.first;
        final normalized = ((20000 - visibility) / 20000).clamp(0.0, 1.0);
        fogPercent = (normalized * 100).round();
      }

      int? smokeAqi;
      try {
        final aqiUri =
            Uri.https('air-quality-api.open-meteo.com', '/v1/air-quality', {
              'latitude': position.latitude.toString(),
              'longitude': position.longitude.toString(),
              'current': 'us_aqi',
              'timezone': 'auto',
            });
        final aqiResponse = await http.get(aqiUri);
        if (aqiResponse.statusCode == 200) {
          final aqiDecoded =
              jsonDecode(aqiResponse.body) as Map<String, dynamic>;
          final aqiCurrent =
              aqiDecoded['current'] as Map<String, dynamic>? ?? const {};
          smokeAqi = (aqiCurrent['us_aqi'] as num?)?.round();
        }
      } catch (_) {}

      if (!mounted) {
        return;
      }
      setState(() {
        _temperatureF = temperature;
        _windMph = windSpeed;
        _windDirectionDegrees = windDirection;
        _expectedRainPercent = rainPercent;
        _cloudCoverPercent = cloudCover;
        _currentPrecipMm = precipitation;
        _fogPercent = fogPercent;
        _smokeIndexAqi = smokeAqi;
      });
    } catch (error) {
      if (!mounted) {
        return;
      }
      setState(() {
        _liveWeatherError = error.toString().replaceFirst('Bad state: ', '');
      });
    } finally {
      if (mounted) {
        setState(() => _loadingLiveWeather = false);
      }
    }
  }

  Widget _liveWeatherCard() {
    return Card(
      color: const Color(0xFFE7F5E8),
      margin: EdgeInsets.zero,
      child: Padding(
        padding: const EdgeInsets.all(10),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: const [
                Icon(Icons.cloud, size: 16, color: Color(0xFF1E5E2D)),
                SizedBox(width: 6),
                Text(
                  'Live local weather snapshot',
                  style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700),
                ),
              ],
            ),
            const SizedBox(height: 6),
            if (_loadingLiveWeather)
              const Row(
                children: [
                  SizedBox(
                    width: 14,
                    height: 14,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  ),
                  SizedBox(width: 8),
                  Text('Loading weather...', style: TextStyle(fontSize: 12)),
                ],
              )
            else if (_liveWeatherError != null)
              Row(
                children: [
                  Expanded(
                    child: Text(
                      _liveWeatherError!,
                      style: const TextStyle(
                        fontSize: 12,
                        color: Color(0xFF842029),
                      ),
                    ),
                  ),
                  TextButton(
                    onPressed: _loadLiveWeather,
                    child: const Text('Retry'),
                  ),
                ],
              )
            else
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  _weatherMetric(
                    'Temperature',
                    _temperatureF == null
                        ? '--'
                        : '${_temperatureF!.round()} F',
                  ),
                  _weatherMetric(
                    'Wind',
                    _windMph == null ? '--' : '${_windMph!.round()} mph',
                  ),
                  _weatherMetric(
                    'Wind direction',
                    _windDirectionDegrees == null
                        ? '--'
                        : _windDirectionLabel(_windDirectionDegrees),
                  ),
                  _weatherMetric(
                    'Expected rain percentage',
                    _expectedRainPercent == null
                        ? '--'
                        : '${_expectedRainPercent!}%',
                  ),
                  _weatherMetric('Cloudy', _yesNoLabel(_isCloudy)),
                  _weatherMetric('Rainy', _yesNoLabel(_isRainy)),
                  _weatherMetric(
                    'Fog',
                    _fogPercent == null ? '--' : '${_fogPercent!}%',
                  ),
                  _weatherMetric(
                    'Smoke index',
                    _smokeIndexAqi == null ? '--' : '$_smokeIndexAqi',
                  ),
                  if (_isHighHeat)
                    TweenAnimationBuilder<double>(
                      tween: Tween<double>(
                        begin: _heatPulse ? 0.35 : 1.0,
                        end: _heatPulse ? 1.0 : 0.35,
                      ),
                      duration: const Duration(milliseconds: 550),
                      onEnd: () {
                        if (mounted && _isHighHeat) {
                          setState(() => _heatPulse = !_heatPulse);
                        }
                      },
                      builder: (context, opacity, child) =>
                          Opacity(opacity: opacity, child: child),
                      child: Container(
                        margin: const EdgeInsets.only(top: 6),
                        padding: const EdgeInsets.symmetric(
                          horizontal: 10,
                          vertical: 6,
                        ),
                        decoration: BoxDecoration(
                          color: const Color(0xFFC92A2A),
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: const Text(
                          'HIGH HEAT WARNING',
                          style: TextStyle(
                            color: Colors.white,
                            fontSize: 14,
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                      ),
                    ),
                ],
              ),
          ],
        ),
      ),
    );
  }

  Widget _weatherMetric(String label, String value) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 3),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 190,
            child: Text(
              '$label:',
              style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700),
            ),
          ),
          Expanded(
            child: Text(
              value,
              style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w500),
            ),
          ),
        ],
      ),
    );
  }

  String _windDirectionLabel(double? degrees) {
    if (degrees == null) {
      return '';
    }
    const labels = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW', 'N'];
    final normalized = degrees % 360;
    final index = (normalized / 45).round();
    return labels[index];
  }

  bool get _isHighHeat => (_temperatureF ?? -1000) > 90;
  bool? get _isCloudy {
    if (_cloudCoverPercent == null) {
      return null;
    }
    return _cloudCoverPercent! >= 50;
  }

  bool? get _isRainy {
    if (_expectedRainPercent == null && _currentPrecipMm == null) {
      return null;
    }
    final expected = _expectedRainPercent ?? 0;
    final current = _currentPrecipMm ?? 0;
    return expected >= 40 || current > 0;
  }

  bool? get _isSmoky {
    if (_smokeIndexAqi == null) {
      return null;
    }
    return _smokeIndexAqi! >= 100;
  }

  String _yesNoLabel(bool? value) {
    if (value == null) {
      return '--';
    }
    return value ? 'Yes' : 'No';
  }

  List<String> _computedLocalWeatherTags() {
    final tags = <String>[];
    if (_isCloudy == true) {
      tags.add('Cloudy');
    }
    if (_isRainy == true) {
      tags.add('Rainy');
    }
    if (_fogPercent != null && _fogPercent! >= 30) {
      tags.add('Foggy (${_fogPercent!}%)');
    }
    if (_isSmoky == true) {
      tags.add('Smoky');
    }
    if (_smokeIndexAqi != null) {
      tags.add('Smoke index AQI: $_smokeIndexAqi');
    }
    if (_isHighHeat) {
      tags.add('Heat above 90 degrees');
    }
    if (_windMph != null) {
      tags.add(
        'Wind ${_windMph!.round()} mph ${_windDirectionLabel(_windDirectionDegrees)}',
      );
    }
    if (tags.isEmpty) {
      tags.add('Live weather unavailable');
    }
    return tags;
  }
}

class StartSessionScreen extends StatefulWidget {
  const StartSessionScreen({
    super.key,
    required this.controller,
    required this.plannedFoodG,
    required this.smallTidbitG,
    required this.largeTidbitG,
    required this.pickupPieceG,
    required this.localWeather,
  });

  final FalconAppController controller;
  final int plannedFoodG;
  final int smallTidbitG;
  final int largeTidbitG;
  final int pickupPieceG;
  final List<String> localWeather;

  @override
  State<StartSessionScreen> createState() => _StartSessionScreenState();
}

class _StartSessionScreenState extends State<StartSessionScreen> {
  static const Color _entryBlue = kEntryBlue;
  static const Color _entryBlueStrong = kEntryBlueDark;

  final _formKey = GlobalKey<FormState>();
  String? _falconId;
  String? _fieldId;
  FalconBehavior _behavior = FalconBehavior.perch;
  bool _behaviorTouched = false;
  final _weightController = TextEditingController();
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    if (widget.controller.fields.isNotEmpty) {
      _fieldId = widget.controller.fields.first.id;
    }
  }

  @override
  void dispose() {
    _weightController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Approach Falcon')),
      body: Form(
        key: _formKey,
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            if (_falconId == null) ...[
              const Text(
                'Select Falcon',
                style: TextStyle(fontWeight: FontWeight.w700, fontSize: 16),
              ),
              const SizedBox(height: 8),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: widget.controller.falcons
                    .map(
                      (falcon) => SizedBox(
                        width: 112,
                        child: FilledButton(
                          style: FilledButton.styleFrom(
                            minimumSize: const Size(112, 90),
                            backgroundColor: _entryBlue,
                            foregroundColor: const Color(0xFF0A2C5A),
                            elevation: 0,
                            padding: const EdgeInsets.symmetric(
                              horizontal: 8,
                              vertical: 10,
                            ),
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(14),
                              side: const BorderSide(
                                color: kEntryBlueDark,
                                width: 1.2,
                              ),
                            ),
                          ),
                          onPressed: () =>
                              setState(() => _falconId = falcon.id),
                          child: Column(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              ClipRRect(
                                borderRadius: BorderRadius.circular(20),
                                child: Image.network(
                                  _falconImageUrl(falcon.id),
                                  width: 40,
                                  height: 40,
                                  fit: BoxFit.cover,
                                  errorBuilder: (_, _, _) => Container(
                                    width: 40,
                                    height: 40,
                                    decoration: BoxDecoration(
                                      color: Colors.white,
                                      borderRadius: BorderRadius.circular(20),
                                      border: Border.all(
                                        color: const Color(0xFF1E5E2D),
                                        width: 1,
                                      ),
                                    ),
                                    alignment: Alignment.center,
                                    child: const Text(
                                      '🦅',
                                      style: TextStyle(fontSize: 22),
                                    ),
                                  ),
                                ),
                              ),
                              const SizedBox(height: 4),
                              Text(
                                falcon.name,
                                textAlign: TextAlign.center,
                                style: const TextStyle(
                                  fontSize: 12,
                                  fontWeight: FontWeight.w700,
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                    )
                    .toList(),
              ),
            ] else ...[
              Builder(
                builder: (context) {
                  final selected = widget.controller.falconById(_falconId!);
                  return Row(
                    children: [
                      Expanded(
                        child: Text(
                          'Falcon: ${selected.name}',
                          style: const TextStyle(
                            fontWeight: FontWeight.w700,
                            fontSize: 16,
                          ),
                        ),
                      ),
                      TextButton(
                        onPressed: () => setState(() => _falconId = null),
                        child: const Text('Change'),
                      ),
                    ],
                  );
                },
              ),
            ],
            const SizedBox(height: 8),
            _lastFedInfoCard(),
            const SizedBox(height: 12),
            const Text(
              "1. Falcon's behavior towards Falcon handler pickup.",
              style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700),
            ),
            const SizedBox(height: 8),
            Row(
              children: FalconBehavior.values.map((value) {
                final isSelected = value == _behavior;
                final showSelected = _behaviorTouched && isSelected;
                return Expanded(
                  child: Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 3),
                    child: FilledButton.tonal(
                      style: FilledButton.styleFrom(
                        minimumSize: const Size(0, 70),
                        backgroundColor: showSelected
                            ? _entryBlueStrong
                            : _entryBlue,
                        foregroundColor: showSelected
                            ? Colors.white
                            : const Color(0xFF0A2C5A),
                        side: BorderSide(
                          color: showSelected
                              ? const Color(0xFF082A66)
                              : const Color(0xFF9FC1F5),
                          width: showSelected ? 2.2 : 1.0,
                        ),
                        padding: const EdgeInsets.symmetric(
                          horizontal: 6,
                          vertical: 8,
                        ),
                      ),
                      onPressed: () => setState(() {
                        _behavior = value;
                        _behaviorTouched = true;
                      }),
                      child: Text(
                        _behaviorLabel(value),
                        textAlign: TextAlign.center,
                        style: TextStyle(
                          fontSize: 11,
                          fontWeight: showSelected
                              ? FontWeight.w700
                              : FontWeight.w600,
                        ),
                      ),
                    ),
                  ),
                );
              }).toList(),
            ),
            const SizedBox(height: 12),
            const Text(
              '2. Place falcon on glove and hood falcon.',
              style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700),
            ),
            const SizedBox(height: 8),
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Expanded(
                  child: Text(
                    '3. Weigh the falcon on the scale with hood, jesses, and leash, and enter weight.',
                    style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700),
                  ),
                ),
                const SizedBox(width: 8),
                SizedBox(
                  width: 82,
                  child: TextFormField(
                    controller: _weightController,
                    keyboardType: TextInputType.number,
                    textAlign: TextAlign.center,
                    maxLength: 3,
                    inputFormatters: [
                      FilteringTextInputFormatter.digitsOnly,
                      LengthLimitingTextInputFormatter(3),
                    ],
                    decoration: const InputDecoration(
                      filled: true,
                      fillColor: _entryBlue,
                      border: OutlineInputBorder(),
                      enabledBorder: OutlineInputBorder(
                        borderSide: BorderSide(color: kEntryBlueDark),
                      ),
                      focusedBorder: OutlineInputBorder(
                        borderSide: BorderSide(
                          color: kEntryBlueDark,
                          width: 1.6,
                        ),
                      ),
                      hintText: 'g',
                      counterText: '',
                      isDense: true,
                      contentPadding: EdgeInsets.symmetric(
                        horizontal: 6,
                        vertical: 10,
                      ),
                    ),
                    validator: (value) {
                      final parsed = int.tryParse(value ?? '');
                      if (parsed == null || parsed <= 0) {
                        return ' ';
                      }
                      return null;
                    },
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Expanded(
                  child: Text(
                    '4. Attach transmitters to legs of falcon while on scale (hooded).',
                    style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Expanded(
                  child: Text(
                    '5. Remove Jessa\'s, leash, swivel from falcon and attach speedlace through both grommets and clip speedlace into glove clip.',
                    style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Expanded(
                  child: Text(
                    '6. Place hooded Falcon on glove and head out the door. Lock the trailer door behind you.',
                    style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),
            const Text(
              '7. Sit on ATV, unhood falcon, pull speed jesses through, let falcon sit on ATV box, provide one tidbit of food, and allow the falcon to sit on the ATV for a little period of time.',
              style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600),
            ),
            const SizedBox(height: 16),
            FilledButton(
              onPressed: _saving ? null : _startSession,
              child: Text(_saving ? 'Opening next screen...' : 'Next screen'),
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _startSession() async {
    if (!_formKey.currentState!.validate()) {
      return;
    }

    if (_falconId == null) {
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(const SnackBar(content: Text('Select a falcon.')));
      return;
    }

    if (_fieldId == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('No field boundary is configured.')),
      );
      return;
    }

    setState(() => _saving = true);

    try {
      final session = await widget.controller.startSession(
        falconId: _falconId!,
        fieldId: _fieldId!,
        behavior: _behavior,
        falconWeightG: double.parse(_weightController.text.trim()),
        plannedFoodG: widget.plannedFoodG,
        telemetryWorking: true,
        smallTidbitG: widget.smallTidbitG,
        largeTidbitG: widget.largeTidbitG,
        pickupPieceG: widget.pickupPieceG,
        localWeather: widget.localWeather,
      );

      if (!mounted) {
        return;
      }

      Navigator.of(context).pushReplacement(
        MaterialPageRoute(
          builder: (_) => LiveSessionScreen(
            controller: widget.controller,
            sessionId: session.id,
          ),
        ),
      );
    } catch (error) {
      if (!mounted) {
        return;
      }
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Could not approach Falcon: $error')),
      );
      setState(() => _saving = false);
    }
  }

  String _falconImageUrl(String falconId) {
    switch (falconId) {
      case 'f1':
        return 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/79/Falco_peregrinus_good_-_Christopher_Watson.jpg/320px-Falco_peregrinus_good_-_Christopher_Watson.jpg';
      case 'f2':
        return 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/60/Peregrine_Falcon_portrait.jpg/320px-Peregrine_Falcon_portrait.jpg';
      default:
        return 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/23/Falco_peregrinus_-_01.jpg/320px-Falco_peregrinus_-_01.jpg';
    }
  }

  Widget _lastFedInfoCard() {
    if (_falconId == null) {
      return Card(
        margin: EdgeInsets.zero,
        color: Colors.white,
        child: const Padding(
          padding: EdgeInsets.all(10),
          child: Text(
            'Hours since Falcon last fed will appear after selecting a Falcon.',
            style: TextStyle(
              fontSize: 12,
              fontWeight: FontWeight.w600,
              color: Colors.black87,
            ),
          ),
        ),
      );
    }

    final lastFedAt = widget.controller.lastFedAtForFalcon(_falconId!);
    final hoursSince = widget.controller.hoursSinceFalconLastFed(_falconId!);

    if (lastFedAt == null || hoursSince == null) {
      return Card(
        margin: EdgeInsets.zero,
        color: const Color(0xFFFFF2D8),
        child: const Padding(
          padding: EdgeInsets.all(10),
          child: Text(
            'No prior feeding record found for this Falcon.',
            style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700),
          ),
        ),
      );
    }

    return Card(
      margin: EdgeInsets.zero,
      color: const Color(0xFFEAF5E4),
      child: Padding(
        padding: const EdgeInsets.all(10),
        child: Row(
          children: [
            Expanded(
              child: Text(
                'Last fed: ${_fmtDate(lastFedAt)}',
                style: const TextStyle(
                  fontSize: 11.8,
                  fontWeight: FontWeight.w800,
                  color: Colors.black,
                ),
              ),
            ),
            const SizedBox(width: 8),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 7),
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(8),
                border: Border.all(color: Colors.black54, width: 1.2),
                color: Colors.white,
              ),
              child: Text(
                '${hoursSince.toStringAsFixed(1)} hours since Falcon was last fed',
                style: const TextStyle(
                  fontSize: 12.2,
                  fontWeight: FontWeight.w800,
                  color: Colors.black,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class LiveSessionScreen extends StatefulWidget {
  const LiveSessionScreen({
    super.key,
    required this.controller,
    required this.sessionId,
  });

  final FalconAppController controller;
  final String sessionId;

  @override
  State<LiveSessionScreen> createState() => _LiveSessionScreenState();
}

class _LiveSessionScreenState extends State<LiveSessionScreen> {
  Timer? _tick;
  final _pageController = PageController();
  final _rewardCardKey = GlobalKey();
  int _pageIndex = 0;
  String? _flightGuidanceMessage;
  WingbeatQuality? _wingbeat;
  int? _intensity;
  PursuitOutcome? _outcome;
  FalconDistanceFromHandler? _distanceFromHandler;

  @override
  void initState() {
    super.initState();
    _tick = Timer.periodic(const Duration(seconds: 1), (_) {
      if (mounted) {
        setState(() {});
      }
    });
  }

  @override
  void dispose() {
    _tick?.cancel();
    _pageController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final session = widget.controller.sessionById(widget.sessionId);
    final field = widget.controller.fieldById(session.fieldId);
    final falcon = widget.controller.falconById(session.falconId);
    final settings = widget.controller.settings;
    final smallTidbitG = session.smallTidbitG ?? settings.rewardSmallG;
    final largeTidbitG = session.largeTidbitG ?? settings.rewardLargeG;
    final pickupPieceG = session.pickupPieceG ?? settings.rewardPickUpPieceG;
    final foodRemaining = widget.controller.foodRemainingG(session);
    final isFlying = widget.controller.isFlying(session);
    final checklist = widget.controller.postReturnChecklist(session);
    final pickupPieceLogged = session.events.any(
      (event) =>
          event.type == SessionEventType.reward &&
          event.rewardSize == RewardSize.pickUpPiece,
    );

    final canStartFlying =
        !pickupPieceLogged &&
        !isFlying &&
        (!checklist.awaitingCompletion || checklist.rewardLogged);
    final canReturn = !pickupPieceLogged && isFlying;
    final canLogReturnData =
        !pickupPieceLogged && checklist.awaitingCompletion && !isFlying;
    final pursuitComplete =
        _wingbeat != null &&
        _intensity != null &&
        _outcome != null &&
        _distanceFromHandler != null;
    final canLogReward =
        canLogReturnData && !checklist.rewardLogged && pursuitComplete;
    final canEditPursuit =
        canLogReturnData && !checklist.rewardLogged && !checklist.pursuitLogged;
    final highlightPursuit =
        canLogReturnData && !checklist.rewardLogged && !pursuitComplete;
    final highlightReward =
        canLogReturnData && !checklist.rewardLogged && pursuitComplete;
    final quickCounts = settings.starlingQuickCounts
        .where((count) => count != 1000 && count != 500)
        .toList();

    return Scaffold(
      appBar: AppBar(toolbarHeight: 40, title: const SizedBox.shrink()),
      body: SafeArea(
        top: false,
        child: Column(
          children: [
            Expanded(
              child: PageView(
                controller: _pageController,
                onPageChanged: (value) => setState(() => _pageIndex = value),
                children: [
                  LayoutBuilder(
                    builder: (context, constraints) {
                      return SingleChildScrollView(
                        padding: const EdgeInsets.all(6),
                        child: ConstrainedBox(
                          constraints: BoxConstraints(
                            minHeight: constraints.maxHeight,
                          ),
                          child: IntrinsicHeight(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.stretch,
                              children: [
                                Container(
                                  decoration: BoxDecoration(
                                    border: Border.all(
                                      color: const Color(0xFF1F2937),
                                      width: 1.2,
                                    ),
                                    borderRadius: BorderRadius.circular(10),
                                    color: const Color(0xFFFAFBF7),
                                  ),
                                  padding: const EdgeInsets.all(5),
                                  child: Column(
                                    crossAxisAlignment:
                                        CrossAxisAlignment.stretch,
                                    children: [
                                      Text(
                                        'FLYING FALCON - ${falcon.name}',
                                        style: TextStyle(
                                          fontWeight: FontWeight.w800,
                                          fontSize: 16,
                                        ),
                                      ),
                                      const SizedBox(height: 3),
                                      Row(
                                        children: [
                                          Expanded(
                                            child: FilledButton(
                                              style: FilledButton.styleFrom(
                                                backgroundColor: canStartFlying
                                                    ? kEntryBlueDark
                                                    : const Color(0xFF94A3B8),
                                                foregroundColor: Colors.white,
                                                minimumSize: const Size(0, 34),
                                                textStyle: const TextStyle(
                                                  fontSize: 11,
                                                  fontWeight: FontWeight.w700,
                                                ),
                                              ),
                                              onPressed: canStartFlying
                                                  ? () => _startFlight(
                                                      'Falcon pursuit flight',
                                                    )
                                                  : null,
                                              child: const Text(
                                                'Falcon pursuit flight',
                                                textAlign: TextAlign.center,
                                              ),
                                            ),
                                          ),
                                          const SizedBox(width: 6),
                                          Expanded(
                                            child: FilledButton(
                                              style: FilledButton.styleFrom(
                                                backgroundColor: canStartFlying
                                                    ? kEntryBlueDark
                                                    : const Color(0xFF94A3B8),
                                                foregroundColor: Colors.white,
                                                minimumSize: const Size(0, 34),
                                                textStyle: const TextStyle(
                                                  fontSize: 11,
                                                  fontWeight: FontWeight.w700,
                                                ),
                                              ),
                                              onPressed: canStartFlying
                                                  ? () => _startFlight(
                                                      'Falcon soaring flight',
                                                    )
                                                  : null,
                                              child: const Text(
                                                'Falcon soaring flight',
                                                textAlign: TextAlign.center,
                                              ),
                                            ),
                                          ),
                                          const SizedBox(width: 6),
                                          Expanded(
                                            child: FilledButton(
                                              style: FilledButton.styleFrom(
                                                backgroundColor: canStartFlying
                                                    ? kEntryBlueDark
                                                    : const Color(0xFF94A3B8),
                                                foregroundColor: Colors.white,
                                                minimumSize: const Size(0, 34),
                                                textStyle: const TextStyle(
                                                  fontSize: 11,
                                                  fontWeight: FontWeight.w700,
                                                ),
                                              ),
                                              onPressed: canStartFlying
                                                  ? () => _startFlight(
                                                      'Falcon flies to perch',
                                                    )
                                                  : null,
                                              child: const Text(
                                                'Falcon flies to perch',
                                                textAlign: TextAlign.center,
                                              ),
                                            ),
                                          ),
                                        ],
                                      ),
                                      const SizedBox(height: 4),
                                      if (_flightGuidanceMessage != null)
                                        Container(
                                          margin: const EdgeInsets.only(
                                            bottom: 6,
                                          ),
                                          padding: const EdgeInsets.symmetric(
                                            horizontal: 10,
                                            vertical: 8,
                                          ),
                                          decoration: BoxDecoration(
                                            color: const Color(0xFFE8F0FF),
                                            borderRadius: BorderRadius.circular(
                                              8,
                                            ),
                                            border: Border.all(
                                              color: kEntryBlueDark,
                                              width: 1,
                                            ),
                                          ),
                                          child: Text(
                                            _flightGuidanceMessage!,
                                            style: const TextStyle(
                                              fontSize: 11,
                                              fontWeight: FontWeight.w700,
                                              color: Color(0xFF0A2C5A),
                                            ),
                                          ),
                                        ),
                                      SizedBox(
                                        width: double.infinity,
                                        child: FilledButton(
                                          style: FilledButton.styleFrom(
                                            backgroundColor: canReturn
                                                ? const Color(0xFFC92A2A)
                                                : const Color(0xFFB91C1C),
                                            foregroundColor: Colors.white,
                                            minimumSize: const Size(0, 36),
                                          ),
                                          onPressed: canReturn
                                              ? _returnFlight
                                              : null,
                                          child: const Text('Falcon Returns'),
                                        ),
                                      ),
                                      if (checklist.awaitingCompletion &&
                                          !checklist.rewardLogged)
                                        const Padding(
                                          padding: EdgeInsets.only(top: 5),
                                          child: Text(
                                            'Tap a reward before Falcon Flying again. Pursuit selections save automatically with reward.',
                                            style: TextStyle(
                                              fontSize: 10,
                                              color: Color(0xFF842029),
                                              fontWeight: FontWeight.w600,
                                            ),
                                          ),
                                        ),
                                      const SizedBox(height: 4),
                                      Card(
                                        margin: EdgeInsets.zero,
                                        color: highlightPursuit
                                            ? kEntryBlue
                                            : null,
                                        shape: RoundedRectangleBorder(
                                          borderRadius: BorderRadius.circular(
                                            12,
                                          ),
                                          side: BorderSide(
                                            color: highlightPursuit
                                                ? kEntryBlueDark
                                                : const Color(0xFFDDE3EA),
                                            width: highlightPursuit ? 2 : 1,
                                          ),
                                        ),
                                        child: Padding(
                                          padding: const EdgeInsets.all(4),
                                          child: Column(
                                            crossAxisAlignment:
                                                CrossAxisAlignment.start,
                                            children: [
                                              Row(
                                                children: [
                                                  const Text(
                                                    'Pursuit Log',
                                                    style: TextStyle(
                                                      fontWeight:
                                                          FontWeight.w700,
                                                      fontSize: 12,
                                                    ),
                                                  ),
                                                ],
                                              ),
                                              const SizedBox(height: 2),
                                              Row(
                                                crossAxisAlignment:
                                                    CrossAxisAlignment.center,
                                                children: [
                                                  const Expanded(
                                                    child: Text(
                                                      'Wingbeat',
                                                      style: TextStyle(
                                                        fontSize: 10.5,
                                                      ),
                                                    ),
                                                  ),
                                                  const SizedBox(width: 6),
                                                  SizedBox(
                                                    width: 214,
                                                    child: Align(
                                                      alignment:
                                                          Alignment.centerRight,
                                                      child: Wrap(
                                                        spacing: 4,
                                                        runSpacing: 4,
                                                        alignment:
                                                            WrapAlignment.end,
                                                        children: WingbeatQuality
                                                            .values
                                                            .map(
                                                              (
                                                                value,
                                                              ) => _PursuitChoiceButton(
                                                                label:
                                                                    _wingbeatLabel(
                                                                      value,
                                                                    ),
                                                                selected:
                                                                    _wingbeat ==
                                                                    value,
                                                                emphasize:
                                                                    canEditPursuit,
                                                                onPressed:
                                                                    canEditPursuit
                                                                    ? () {
                                                                        _updateWingbeat(
                                                                          _wingbeat ==
                                                                                  value
                                                                              ? const <
                                                                                  WingbeatQuality
                                                                                >{}
                                                                              : {
                                                                                  value,
                                                                                },
                                                                        );
                                                                      }
                                                                    : null,
                                                              ),
                                                            )
                                                            .toList(),
                                                      ),
                                                    ),
                                                  ),
                                                ],
                                              ),
                                              const SizedBox(height: 2),
                                              Row(
                                                crossAxisAlignment:
                                                    CrossAxisAlignment.center,
                                                children: [
                                                  const Expanded(
                                                    child: Text(
                                                      'Falcon\'s response to reward:',
                                                      style: TextStyle(
                                                        fontSize: 10.5,
                                                      ),
                                                    ),
                                                  ),
                                                  const SizedBox(width: 6),
                                                  SizedBox(
                                                    width: 214,
                                                    child: Align(
                                                      alignment:
                                                          Alignment.centerRight,
                                                      child: Wrap(
                                                        spacing: 4,
                                                        runSpacing: 4,
                                                        alignment:
                                                            WrapAlignment.end,
                                                        children: [
                                                          _PursuitChoiceButton(
                                                            label: 'Instant',
                                                            selected:
                                                                _intensity == 1,
                                                            emphasize:
                                                                canEditPursuit,
                                                            onPressed:
                                                                canEditPursuit
                                                                ? () {
                                                                    _updateIntensity(
                                                                      _intensity ==
                                                                              1
                                                                          ? const <
                                                                              int
                                                                            >{}
                                                                          : const {
                                                                              1,
                                                                            },
                                                                    );
                                                                  }
                                                                : null,
                                                          ),
                                                          _PursuitChoiceButton(
                                                            label: 'Delayed',
                                                            selected:
                                                                _intensity == 2,
                                                            emphasize:
                                                                canEditPursuit,
                                                            onPressed:
                                                                canEditPursuit
                                                                ? () {
                                                                    _updateIntensity(
                                                                      _intensity ==
                                                                              2
                                                                          ? const <
                                                                              int
                                                                            >{}
                                                                          : const {
                                                                              2,
                                                                            },
                                                                    );
                                                                  }
                                                                : null,
                                                          ),
                                                        ],
                                                      ),
                                                    ),
                                                  ),
                                                ],
                                              ),
                                              const SizedBox(height: 2),
                                              Row(
                                                crossAxisAlignment:
                                                    CrossAxisAlignment.center,
                                                children: [
                                                  const Expanded(
                                                    child: Text(
                                                      'Falcon distance from handler',
                                                      style: TextStyle(
                                                        fontSize: 10.5,
                                                      ),
                                                    ),
                                                  ),
                                                  const SizedBox(width: 6),
                                                  SizedBox(
                                                    width: 214,
                                                    child: Align(
                                                      alignment:
                                                          Alignment.centerRight,
                                                      child: Wrap(
                                                        spacing: 4,
                                                        runSpacing: 4,
                                                        alignment:
                                                            WrapAlignment.end,
                                                        children: [
                                                          _PursuitChoiceButton(
                                                            label: 'Visible',
                                                            selected:
                                                                _distanceFromHandler ==
                                                                FalconDistanceFromHandler
                                                                    .inView,
                                                            emphasize:
                                                                canEditPursuit,
                                                            onPressed:
                                                                canEditPursuit
                                                                ? () {
                                                                    _updateDistanceFromHandler(
                                                                      _distanceFromHandler ==
                                                                              FalconDistanceFromHandler.inView
                                                                          ? const <
                                                                              FalconDistanceFromHandler
                                                                            >{}
                                                                          : const {
                                                                              FalconDistanceFromHandler.inView,
                                                                            },
                                                                    );
                                                                  }
                                                                : null,
                                                          ),
                                                          _PursuitChoiceButton(
                                                            label:
                                                                'Out of sight',
                                                            selected:
                                                                _distanceFromHandler ==
                                                                FalconDistanceFromHandler
                                                                    .outOfSight,
                                                            emphasize:
                                                                canEditPursuit,
                                                            onPressed:
                                                                canEditPursuit
                                                                ? () {
                                                                    _updateDistanceFromHandler(
                                                                      _distanceFromHandler ==
                                                                              FalconDistanceFromHandler.outOfSight
                                                                          ? const <
                                                                              FalconDistanceFromHandler
                                                                            >{}
                                                                          : const {
                                                                              FalconDistanceFromHandler.outOfSight,
                                                                            },
                                                                    );
                                                                  }
                                                                : null,
                                                          ),
                                                        ],
                                                      ),
                                                    ),
                                                  ),
                                                ],
                                              ),
                                              const SizedBox(height: 2),
                                              Row(
                                                crossAxisAlignment:
                                                    CrossAxisAlignment.center,
                                                children: [
                                                  const Expanded(
                                                    child: Text(
                                                      'Outcome',
                                                      style: TextStyle(
                                                        fontSize: 10.5,
                                                      ),
                                                    ),
                                                  ),
                                                  const SizedBox(width: 6),
                                                  SizedBox(
                                                    width: 214,
                                                    child: Align(
                                                      alignment:
                                                          Alignment.centerRight,
                                                      child: Wrap(
                                                        spacing: 4,
                                                        runSpacing: 4,
                                                        alignment:
                                                            WrapAlignment.end,
                                                        children:
                                                            const [
                                                                  PursuitOutcome
                                                                      .kill,
                                                                  PursuitOutcome
                                                                      .ignore,
                                                                  PursuitOutcome
                                                                      .chase,
                                                                ]
                                                                .map(
                                                                  (
                                                                    value,
                                                                  ) => _PursuitChoiceButton(
                                                                    label:
                                                                        _outcomeLabel(
                                                                          value,
                                                                        ),
                                                                    selected:
                                                                        _outcome ==
                                                                        value,
                                                                    emphasize:
                                                                        canEditPursuit,
                                                                    onPressed:
                                                                        canEditPursuit
                                                                        ? () {
                                                                            _updateOutcome(
                                                                              _outcome ==
                                                                                      value
                                                                                  ? const <
                                                                                      PursuitOutcome
                                                                                    >{}
                                                                                  : {
                                                                                      value,
                                                                                    },
                                                                            );
                                                                          }
                                                                        : null,
                                                                  ),
                                                                )
                                                                .toList(),
                                                      ),
                                                    ),
                                                  ),
                                                ],
                                              ),
                                            ],
                                          ),
                                        ),
                                      ),
                                      const SizedBox(height: 4),
                                      Card(
                                        key: _rewardCardKey,
                                        margin: EdgeInsets.zero,
                                        color: highlightReward
                                            ? kEntryBlue
                                            : null,
                                        shape: RoundedRectangleBorder(
                                          borderRadius: BorderRadius.circular(
                                            12,
                                          ),
                                          side: BorderSide(
                                            color: highlightReward
                                                ? kEntryBlueDark
                                                : const Color(0xFFDDE3EA),
                                            width: highlightReward ? 2 : 1,
                                          ),
                                        ),
                                        child: Padding(
                                          padding: const EdgeInsets.all(4),
                                          child: Column(
                                            crossAxisAlignment:
                                                CrossAxisAlignment.start,
                                            children: [
                                              Row(
                                                children: [
                                                  const Text(
                                                    'Reward',
                                                    style: TextStyle(
                                                      fontWeight:
                                                          FontWeight.w700,
                                                      fontSize: 12,
                                                    ),
                                                  ),
                                                ],
                                              ),
                                              const SizedBox(height: 2),
                                              Row(
                                                children: [
                                                  _RewardButton(
                                                    label:
                                                        'Glove ${smallTidbitG}g',
                                                    emphasize: canLogReward,
                                                    onPressed: canLogReward
                                                        ? () => _reward(
                                                            RewardSize.small,
                                                            gramsOverride:
                                                                smallTidbitG,
                                                          )
                                                        : null,
                                                  ),
                                                  _RewardButton(
                                                    label:
                                                        'Glove ${largeTidbitG}g',
                                                    emphasize: canLogReward,
                                                    onPressed: canLogReward
                                                        ? () => _reward(
                                                            RewardSize.large,
                                                            gramsOverride:
                                                                largeTidbitG,
                                                          )
                                                        : null,
                                                  ),
                                                  _RewardButton(
                                                    label:
                                                        'Glove pickup piece ${pickupPieceG}g',
                                                    destructive: true,
                                                    emphasize: canLogReward,
                                                    onPressed: canLogReward
                                                        ? () =>
                                                              _openPickUpPieceInstructions(
                                                                pickupPieceG,
                                                              )
                                                        : null,
                                                  ),
                                                ],
                                              ),
                                              const SizedBox(height: 2),
                                              Row(
                                                children: [
                                                  _RewardButton(
                                                    label:
                                                        'Lure ${smallTidbitG}g',
                                                    emphasize: canLogReward,
                                                    onPressed: canLogReward
                                                        ? () => _reward(
                                                            RewardSize.small,
                                                            gramsOverride:
                                                                smallTidbitG,
                                                          )
                                                        : null,
                                                  ),
                                                  _RewardButton(
                                                    label:
                                                        'Lure ${largeTidbitG}g',
                                                    emphasize: canLogReward,
                                                    onPressed: canLogReward
                                                        ? () => _reward(
                                                            RewardSize.large,
                                                            gramsOverride:
                                                                largeTidbitG,
                                                          )
                                                        : null,
                                                  ),
                                                  _RewardButton(
                                                    label:
                                                        'Lure pickup piece ${pickupPieceG}g',
                                                    destructive: true,
                                                    emphasize: canLogReward,
                                                    onPressed: canLogReward
                                                        ? () =>
                                                              _openPickUpPieceInstructions(
                                                                pickupPieceG,
                                                              )
                                                        : null,
                                                  ),
                                                ],
                                              ),
                                            ],
                                          ),
                                        ),
                                      ),
                                      const SizedBox(height: 4),
                                      Wrap(
                                        spacing: 4,
                                        runSpacing: 1,
                                        children: [
                                          _MetricText(
                                            '(Session, ${_fmtDuration(widget.controller.sessionMinutes(session))})',
                                          ),
                                          _MetricText(
                                            '(Flying, ${_fmtDuration(widget.controller.flyingMinutes(session))})',
                                          ),
                                          _MetricText(
                                            '(Sitting, ${_fmtDuration(widget.controller.sittingMinutes(session))})',
                                          ),
                                          _MetricText(
                                            '(Remaining quail to feed falcon, ${foodRemaining}g)',
                                          ),
                                        ],
                                      ),
                                    ],
                                  ),
                                ),
                                Container(
                                  margin: const EdgeInsets.only(
                                    top: 4,
                                    bottom: 2,
                                  ),
                                  padding: const EdgeInsets.all(4),
                                  decoration: BoxDecoration(
                                    border: Border.all(
                                      color: const Color(0xFF1F2937),
                                      width: 1.2,
                                    ),
                                    borderRadius: BorderRadius.circular(10),
                                    color: Colors.white,
                                  ),
                                  child: Column(
                                    crossAxisAlignment:
                                        CrossAxisAlignment.stretch,
                                    children: [
                                      const Row(
                                        crossAxisAlignment:
                                            CrossAxisAlignment.start,
                                        children: [
                                          Expanded(
                                            flex: 7,
                                            child: Text(
                                              'STARLING ACTIVITY',
                                              maxLines: 1,
                                              softWrap: false,
                                              style: TextStyle(
                                                fontWeight: FontWeight.w800,
                                                fontSize: 15,
                                              ),
                                            ),
                                          ),
                                          SizedBox(width: 6),
                                          SizedBox(
                                            width: 124,
                                            child: Text(
                                              'Tap buttons for each new flock observed in real time.',
                                              textAlign: TextAlign.right,
                                              maxLines: 2,
                                              style: TextStyle(
                                                fontSize: 8.5,
                                                color: Colors.black,
                                                height: 1.0,
                                              ),
                                            ),
                                          ),
                                        ],
                                      ),
                                      const SizedBox(height: 3),
                                      const Text(
                                        'Off Property',
                                        style: TextStyle(
                                          fontSize: 12,
                                          fontWeight: FontWeight.w600,
                                        ),
                                      ),
                                      const SizedBox(height: 3),
                                      Row(
                                        children: quickCounts
                                            .map(
                                              (count) => Expanded(
                                                child: Padding(
                                                  padding:
                                                      const EdgeInsets.symmetric(
                                                        horizontal: 2,
                                                      ),
                                                  child: FilledButton(
                                                    style: FilledButton.styleFrom(
                                                      backgroundColor:
                                                          kEntryBlueDark,
                                                      foregroundColor:
                                                          Colors.white,
                                                      minimumSize: const Size(
                                                        0,
                                                        36,
                                                      ),
                                                      padding:
                                                          const EdgeInsets.symmetric(
                                                            horizontal: 6,
                                                            vertical: 0,
                                                          ),
                                                    ),
                                                    onPressed: pickupPieceLogged
                                                        ? null
                                                        : () => _logStarling(
                                                            count,
                                                            categoryLabel:
                                                                'Off Property',
                                                          ),
                                                    child: Text(
                                                      '$count',
                                                      style: const TextStyle(
                                                        fontSize: 14,
                                                        fontWeight:
                                                            FontWeight.w800,
                                                      ),
                                                    ),
                                                  ),
                                                ),
                                              ),
                                            )
                                            .toList(),
                                      ),
                                      const SizedBox(height: 5),
                                      const Text(
                                        'In Property',
                                        style: TextStyle(
                                          fontSize: 12,
                                          fontWeight: FontWeight.w600,
                                        ),
                                      ),
                                      const SizedBox(height: 3),
                                      Row(
                                        children: quickCounts
                                            .map(
                                              (count) => Expanded(
                                                child: Padding(
                                                  padding:
                                                      const EdgeInsets.symmetric(
                                                        horizontal: 2,
                                                      ),
                                                  child: FilledButton(
                                                    style: FilledButton.styleFrom(
                                                      backgroundColor:
                                                          kEntryBlueDark,
                                                      foregroundColor:
                                                          Colors.white,
                                                      minimumSize: const Size(
                                                        0,
                                                        36,
                                                      ),
                                                      padding:
                                                          const EdgeInsets.symmetric(
                                                            horizontal: 6,
                                                            vertical: 0,
                                                          ),
                                                    ),
                                                    onPressed: pickupPieceLogged
                                                        ? null
                                                        : () => _logStarling(
                                                            count,
                                                            categoryLabel:
                                                                'In Property',
                                                          ),
                                                    child: Text(
                                                      '$count',
                                                      style: const TextStyle(
                                                        fontSize: 14,
                                                        fontWeight:
                                                            FontWeight.w800,
                                                      ),
                                                    ),
                                                  ),
                                                ),
                                              ),
                                            )
                                            .toList(),
                                      ),
                                    ],
                                  ),
                                ),
                                const SizedBox(height: 4),
                                FilledButton.icon(
                                  style: FilledButton.styleFrom(
                                    backgroundColor: const Color(0xFF862626),
                                    foregroundColor: Colors.white,
                                    minimumSize: const Size(0, 36),
                                  ),
                                  onPressed: () {
                                    Navigator.of(context).push(
                                      MaterialPageRoute(
                                        builder: (_) => DoneFlyingScreen(
                                          controller: widget.controller,
                                          sessionId: widget.sessionId,
                                        ),
                                      ),
                                    );
                                  },
                                  icon: const Icon(Icons.stop_circle),
                                  label: const Text('End Flying Session'),
                                ),
                              ],
                            ),
                          ),
                        ),
                      );
                    },
                  ),
                  _FieldBoundaryMapPage(field: field, session: session),
                ],
              ),
            ),
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                _PageDot(active: _pageIndex == 0),
                const SizedBox(width: 6),
                _PageDot(active: _pageIndex == 1),
              ],
            ),
            const SizedBox(height: 6),
          ],
        ),
      ),
    );
  }

  void _updateWingbeat(Set<WingbeatQuality> selected) {
    setState(() {
      _wingbeat = selected.isEmpty ? null : selected.first;
    });
    _advanceAfterPursuitEntry();
  }

  void _updateIntensity(Set<int> selected) {
    setState(() {
      _intensity = selected.isEmpty ? null : selected.first;
    });
    _advanceAfterPursuitEntry();
  }

  void _updateOutcome(Set<PursuitOutcome> selected) {
    setState(() {
      _outcome = selected.isEmpty ? null : selected.first;
    });
    _advanceAfterPursuitEntry();
  }

  void _updateDistanceFromHandler(Set<FalconDistanceFromHandler> selected) {
    setState(() {
      _distanceFromHandler = selected.isEmpty ? null : selected.first;
    });
    _advanceAfterPursuitEntry();
  }

  void _advanceAfterPursuitEntry() {
    if (_wingbeat == null ||
        _intensity == null ||
        _outcome == null ||
        _distanceFromHandler == null) {
      return;
    }
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final context = _rewardCardKey.currentContext;
      if (context == null || !mounted) {
        return;
      }
      Scrollable.ensureVisible(
        context,
        duration: const Duration(milliseconds: 220),
        curve: Curves.easeOut,
        alignment: 0.2,
      );
    });
  }

  Future<void> _startFlight(String flightType) async {
    try {
      await widget.controller.addFlyingStart(
        widget.sessionId,
        flightType: flightType,
      );
      if (mounted) {
        setState(() {
          if (flightType == 'Falcon flies to perch') {
            _flightGuidanceMessage =
                'Drive ATV 15 miles an hour around the property perimeter, and every bird you see, toot the whistle one time. Upon Falcon leaving perch and chasing starlings, double toot whistle, call Falcon back to garnished glove. Give a small tidbit as a reward.';
          } else if (flightType == 'Falcon soaring flight') {
            _flightGuidanceMessage =
                'Allow Falcon to get to 100 feet in the air, drive 15 miles an hour towards starlings to flush them. After Falcon chases starlings, double toot whistle, offer a large tidbit on the glove.';
          } else {
            _flightGuidanceMessage = null;
          }
        });
      }
    } catch (error) {
      if (!mounted || !context.mounted) {
        return;
      }
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text(error.toString())));
    }
  }

  Future<void> _returnFlight() async {
    try {
      await widget.controller.addFlyingEnd(widget.sessionId);
      if (!mounted) {
        return;
      }
      setState(() {
        _flightGuidanceMessage = null;
        _wingbeat = null;
        _intensity = null;
        _outcome = null;
        _distanceFromHandler = null;
      });
    } catch (error) {
      if (!mounted || !context.mounted) {
        return;
      }
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text(error.toString())));
    }
  }

  Future<bool> _reward(RewardSize size, {int? gramsOverride}) async {
    final selectedWingbeat = _wingbeat;
    final selectedIntensity = _intensity;
    final selectedOutcome = _outcome;
    final selectedDistanceFromHandler = _distanceFromHandler;
    try {
      await widget.controller.addReward(
        widget.sessionId,
        size,
        gramsOverride: gramsOverride,
      );
      if (selectedWingbeat != null &&
          selectedIntensity != null &&
          selectedOutcome != null &&
          selectedDistanceFromHandler != null) {
        await widget.controller.addPursuit(
          sessionId: widget.sessionId,
          wingbeat: selectedWingbeat,
          intensity: selectedIntensity,
          outcome: selectedOutcome,
          distanceFromHandler: selectedDistanceFromHandler,
        );
      }
    } catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text(error.toString())));
      }
      return false;
    }
    if (mounted) {
      setState(() {
        _wingbeat = null;
        _intensity = null;
        _outcome = null;
        _distanceFromHandler = null;
      });
    }
    return true;
  }

  Future<void> _openPickUpPieceInstructions(int pickupPieceG) async {
    final proceedToEnd = await Navigator.of(context).push<bool>(
      MaterialPageRoute(builder: (_) => const PickupPieceInstructionsScreen()),
    );
    if (!mounted || proceedToEnd != true) {
      return;
    }
    final logged = await _reward(
      RewardSize.pickUpPiece,
      gramsOverride: pickupPieceG,
    );
    if (!mounted || !logged) {
      return;
    }
    Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => DoneFlyingScreen(
          controller: widget.controller,
          sessionId: widget.sessionId,
        ),
      ),
    );
  }

  Future<void> _logStarling(int count, {required String categoryLabel}) async {
    await widget.controller.addStarlingSighting(
      sessionId: widget.sessionId,
      count: count,
      categoryNote: categoryLabel,
    );
  }
}

class PickupPieceInstructionsScreen extends StatefulWidget {
  const PickupPieceInstructionsScreen({super.key});

  @override
  State<PickupPieceInstructionsScreen> createState() =>
      _PickupPieceInstructionsScreenState();
}

class _PickupPieceInstructionsScreenState
    extends State<PickupPieceInstructionsScreen> {
  bool _fedRemainingTidbits = false;

  @override
  Widget build(BuildContext context) {
    const steps = [
      '#1 thread jesses through grommets',
      '#2 attach the clip to the jesses',
      '#3 attach leash to jesses',
      '#4 unclip jesses, clip into leash',
      '#5 clean up leash on glove',
      '#6 feed all remaining tidbits in bag',
      '#7 spray falcon\'s beak down with water',
      '#8 allow the falcon to rest a minute',
      '#9 clean the beak with your fingers',
      '#10 hood falcon',
      '• Time to head back to the trailer.',
    ];

    return Scaffold(
      appBar: AppBar(title: const Text('Pickup Piece')),
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const Text(
                'As falcon is feeding on the pickup piece:',
                style: TextStyle(
                  fontSize: 22,
                  fontWeight: FontWeight.w700,
                  height: 1.28,
                ),
              ),
              const SizedBox(height: 12),
              Expanded(
                child: ListView.separated(
                  itemCount: steps.length,
                  separatorBuilder: (_, _) => const SizedBox(height: 6),
                  itemBuilder: (context, index) => Text(
                    steps[index],
                    style: const TextStyle(
                      fontSize: 19,
                      fontWeight: FontWeight.w700,
                      height: 1.22,
                    ),
                  ),
                ),
              ),
              const SizedBox(height: 10),
              SizedBox(
                width: double.infinity,
                child: FilledButton(
                  style: FilledButton.styleFrom(
                    backgroundColor: kEntryBlueDark,
                    foregroundColor: Colors.white,
                    minimumSize: const Size(0, 42),
                  ),
                  onPressed: _fedRemainingTidbits
                      ? null
                      : () {
                          setState(() => _fedRemainingTidbits = true);
                        },
                  child: Text(
                    _fedRemainingTidbits
                        ? 'Feed all remaining tidbits in bag (Done)'
                        : 'Feed all remaining tidbits in bag',
                  ),
                ),
              ),
              const SizedBox(height: 10),
              Row(
                children: [
                  Expanded(
                    child: OutlinedButton.icon(
                      onPressed: () => Navigator.of(context).pop(false),
                      icon: const Icon(Icons.arrow_back),
                      label: const Text('Back'),
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: FilledButton.icon(
                      style: FilledButton.styleFrom(
                        backgroundColor: const Color(0xFF862626),
                        foregroundColor: Colors.white,
                      ),
                      onPressed: _fedRemainingTidbits
                          ? () => Navigator.of(context).pop(true)
                          : null,
                      icon: const Icon(Icons.stop_circle),
                      label: const Text('End Flying Session'),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class DoneFlyingScreen extends StatefulWidget {
  const DoneFlyingScreen({
    super.key,
    required this.controller,
    required this.sessionId,
  });

  final FalconAppController controller;
  final String sessionId;

  @override
  State<DoneFlyingScreen> createState() => _DoneFlyingScreenState();
}

class _DoneFlyingScreenState extends State<DoneFlyingScreen> {
  final _formKey = GlobalKey<FormState>();
  final TextEditingController _postFlightWeightController =
      TextEditingController();
  final _maxAltitudeController = TextEditingController();
  final _maxSpeedController = TextEditingController();
  final _voiceController = TextEditingController();

  DesiredWeightTrend _desiredWeight = DesiredWeightTrend.same;
  final bool _keptOut = true;
  final bool _seenInside = false;
  bool _saving = false;

  @override
  void dispose() {
    _postFlightWeightController.dispose();
    _maxAltitudeController.dispose();
    _maxSpeedController.dispose();
    _voiceController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    const steps = [
      '1. Take Falcon inside trailer and shut door behind you.',
      '2. Turn on scale, place hooded falcon on scale perch with jesses and leash. Cut transmitters from leg and remove from scale.',
      '4. Record weight of falcon.',
      '5. Tie hooded falcon to perch.',
      '7. Provide fresh water if needed.',
      '8. Remove hood from falcon.',
      '9. Recharge transmitter batteries, plug in iPhone, plug in equipment.',
    ];

    return Scaffold(
      appBar: AppBar(title: const Text('Flight Session Completed')),
      body: SafeArea(
        child: Form(
          key: _formKey,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const Padding(
                padding: EdgeInsets.fromLTRB(12, 8, 12, 4),
                child: Text(
                  'Remaining Tasks:',
                  style: TextStyle(fontSize: 17, fontWeight: FontWeight.w700),
                ),
              ),
              Expanded(
                child: SingleChildScrollView(
                  padding: const EdgeInsets.fromLTRB(12, 4, 12, 6),
                  child: Column(
                    children: [
                      for (final step in steps) ...[
                        if (!step.startsWith('4.')) ...[
                          Align(
                            alignment: Alignment.centerLeft,
                            child: Text(
                              step,
                              style: const TextStyle(
                                fontSize: 12.5,
                                fontWeight: FontWeight.w600,
                                height: 1.25,
                              ),
                            ),
                          ),
                        ] else ...[
                          Row(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              const Expanded(
                                child: Text(
                                  '4. Record weight of falcon.',
                                  style: TextStyle(
                                    fontSize: 12.5,
                                    fontWeight: FontWeight.w700,
                                    color: Color(0xFF0A2C5A),
                                    height: 1.25,
                                  ),
                                ),
                              ),
                              const SizedBox(width: 8),
                              SizedBox(
                                width: 82,
                                child: TextFormField(
                                  controller: _postFlightWeightController,
                                  keyboardType: TextInputType.number,
                                  maxLength: 4,
                                  inputFormatters: [
                                    FilteringTextInputFormatter.digitsOnly,
                                  ],
                                  textAlign: TextAlign.center,
                                  decoration: const InputDecoration(
                                    isDense: true,
                                    filled: true,
                                    fillColor: kEntryBlue,
                                    border: OutlineInputBorder(),
                                    enabledBorder: OutlineInputBorder(
                                      borderSide: BorderSide(
                                        color: kEntryBlueDark,
                                      ),
                                    ),
                                    focusedBorder: OutlineInputBorder(
                                      borderSide: BorderSide(
                                        color: kEntryBlueDark,
                                        width: 1.6,
                                      ),
                                    ),
                                    hintText: 'grams',
                                    counterText: '',
                                    contentPadding: EdgeInsets.symmetric(
                                      horizontal: 6,
                                      vertical: 8,
                                    ),
                                  ),
                                ),
                              ),
                            ],
                          ),
                        ],
                        const SizedBox(height: 6),
                      ],
                      const Divider(height: 16),
                      const Align(
                        alignment: Alignment.centerLeft,
                        child: Text(
                          'Post-Flight Metrics',
                          style: TextStyle(
                            fontSize: 17,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      ),
                      const SizedBox(height: 3),
                      _metricPairRowCompact(
                        leftLabel: 'Max altitude (ft)',
                        leftController: _maxAltitudeController,
                        rightLabel: 'Max speed (mph)',
                        rightController: _maxSpeedController,
                      ),
                      const SizedBox(height: 5),
                      Row(
                        crossAxisAlignment: CrossAxisAlignment.center,
                        children: [
                          const Expanded(
                            child: Text(
                              '• Desired weight tomorrow',
                              style: TextStyle(
                                fontWeight: FontWeight.w700,
                                fontSize: 12.5,
                                color: Color(0xFF0A2C5A),
                              ),
                            ),
                          ),
                          const SizedBox(width: 6),
                          Wrap(
                            spacing: 3,
                            children: DesiredWeightTrend.values
                                .map(
                                  (value) => ChoiceChip(
                                    materialTapTargetSize:
                                        MaterialTapTargetSize.shrinkWrap,
                                    visualDensity: VisualDensity.compact,
                                    backgroundColor: kEntryBlue,
                                    selectedColor: kEntryBlueDark,
                                    padding: const EdgeInsets.symmetric(
                                      horizontal: 5,
                                      vertical: 0,
                                    ),
                                    label: Text(
                                      _desiredWeightLabel(value),
                                      style: TextStyle(
                                        fontSize: 10,
                                        color: _desiredWeight == value
                                            ? Colors.white
                                            : const Color(0xFF0A2C5A),
                                        fontWeight: FontWeight.w700,
                                      ),
                                    ),
                                    selected: _desiredWeight == value,
                                    onSelected: (_) =>
                                        setState(() => _desiredWeight = value),
                                  ),
                                )
                                .toList(),
                          ),
                        ],
                      ),
                      const SizedBox(height: 4),
                      TextFormField(
                        controller: _voiceController,
                        minLines: 3,
                        maxLines: 4,
                        style: const TextStyle(fontSize: 13),
                        decoration: const InputDecoration(
                          border: OutlineInputBorder(),
                          filled: true,
                          fillColor: kEntryBlue,
                          enabledBorder: OutlineInputBorder(
                            borderSide: BorderSide(color: kEntryBlueDark),
                          ),
                          focusedBorder: OutlineInputBorder(
                            borderSide: BorderSide(
                              color: kEntryBlueDark,
                              width: 1.6,
                            ),
                          ),
                          contentPadding: EdgeInsets.symmetric(
                            horizontal: 10,
                            vertical: 12,
                          ),
                          hintText: 'Voice/text narrative...',
                        ),
                      ),
                      const SizedBox(height: 4),
                      const Align(
                        alignment: Alignment.centerLeft,
                        child: Text(
                          'Tap the narrative box above, then start talking.',
                          style: TextStyle(
                            fontSize: 12,
                            color: Color(0xFF0A2C5A),
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(12, 4, 12, 10),
                child: FilledButton.icon(
                  style: FilledButton.styleFrom(
                    minimumSize: const Size.fromHeight(40),
                  ),
                  onPressed: _saving ? null : _saveSession,
                  icon: const Icon(Icons.save),
                  label: Text(_saving ? 'Saving...' : 'Save Session'),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _metricPairRowCompact({
    required String leftLabel,
    required TextEditingController leftController,
    required String rightLabel,
    required TextEditingController rightController,
  }) {
    return Row(
      children: [
        Expanded(
          child: _metricFieldCompact(
            label: leftLabel,
            controller: leftController,
          ),
        ),
        const SizedBox(width: 8),
        Expanded(
          child: _metricFieldCompact(
            label: rightLabel,
            controller: rightController,
          ),
        ),
      ],
    );
  }

  Widget _metricFieldCompact({
    required String label,
    required TextEditingController controller,
  }) {
    return Row(
      children: [
        Expanded(
          child: Text(
            label,
            style: const TextStyle(
              fontSize: 12.5,
              fontWeight: FontWeight.w700,
              color: Color(0xFF0A2C5A),
            ),
          ),
        ),
        const SizedBox(width: 4),
        SizedBox(
          width: 62,
          child: TextFormField(
            controller: controller,
            keyboardType: const TextInputType.numberWithOptions(decimal: true),
            textAlign: TextAlign.center,
            style: const TextStyle(fontSize: 11),
            decoration: const InputDecoration(
              border: OutlineInputBorder(),
              filled: true,
              fillColor: kEntryBlue,
              enabledBorder: OutlineInputBorder(
                borderSide: BorderSide(color: kEntryBlueDark),
              ),
              focusedBorder: OutlineInputBorder(
                borderSide: BorderSide(color: kEntryBlueDark, width: 1.6),
              ),
              isDense: true,
              contentPadding: EdgeInsets.symmetric(horizontal: 4, vertical: 8),
            ),
            validator: (value) {
              final parsed = double.tryParse(value ?? '');
              if (parsed == null || parsed < 0) {
                return ' ';
              }
              return null;
            },
          ),
        ),
      ],
    );
  }

  Future<void> _saveSession() async {
    if (!_formKey.currentState!.validate()) {
      return;
    }

    setState(() => _saving = true);
    try {
      await widget.controller.endSession(
        sessionId: widget.sessionId,
        input: SessionPostFlightInput(
          maxAltitudeFt: double.parse(_maxAltitudeController.text.trim()),
          maxDistanceFromHandlerMiles: 0,
          totalDistanceFlownMiles: 0,
          maxSpeedMph: double.parse(_maxSpeedController.text.trim()),
          desiredWeight: _desiredWeight,
          keptStarlingsOut: _keptOut,
          starlingsSeenInsideBoundary: _seenInside,
          voiceTranscript: _voiceController.text.trim().isEmpty
              ? 'No narrative entered.'
              : _voiceController.text.trim(),
        ),
      );
    } catch (error) {
      if (!mounted) {
        return;
      }
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text(error.toString())));
      setState(() => _saving = false);
      return;
    }

    if (!mounted) {
      return;
    }

    Navigator.of(context).popUntil((route) => route.isFirst);
  }
}

class _RewardButton extends StatelessWidget {
  const _RewardButton({
    required this.label,
    required this.onPressed,
    required this.emphasize,
    this.destructive = false,
  });

  final String label;
  final VoidCallback? onPressed;
  final bool emphasize;
  final bool destructive;

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 2),
        child: destructive
            ? FilledButton(
                style: FilledButton.styleFrom(
                  backgroundColor: emphasize
                      ? const Color(0xFFC92A2A)
                      : const Color(0xFFB45353),
                  foregroundColor: Colors.white,
                  minimumSize: const Size(0, 28),
                  padding: const EdgeInsets.symmetric(
                    horizontal: 2,
                    vertical: 0,
                  ),
                  textStyle: const TextStyle(
                    fontSize: 9,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                onPressed: onPressed,
                child: Text(label, textAlign: TextAlign.center),
              )
            : emphasize
            ? FilledButton(
                style: FilledButton.styleFrom(
                  backgroundColor: kEntryBlueDark,
                  foregroundColor: Colors.white,
                  minimumSize: const Size(0, 28),
                  padding: const EdgeInsets.symmetric(
                    horizontal: 2,
                    vertical: 0,
                  ),
                  textStyle: const TextStyle(
                    fontSize: 9,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                onPressed: onPressed,
                child: Text(label, textAlign: TextAlign.center),
              )
            : FilledButton(
                style: FilledButton.styleFrom(
                  backgroundColor: kEntryBlue,
                  foregroundColor: const Color(0xFF0A2C5A),
                  minimumSize: const Size(0, 28),
                  padding: const EdgeInsets.symmetric(
                    horizontal: 2,
                    vertical: 0,
                  ),
                  textStyle: const TextStyle(
                    fontSize: 9,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                onPressed: onPressed,
                child: Text(label, textAlign: TextAlign.center),
              ),
      ),
    );
  }
}

class _PursuitChoiceButton extends StatelessWidget {
  const _PursuitChoiceButton({
    required this.label,
    required this.selected,
    required this.emphasize,
    required this.onPressed,
  });

  final String label;
  final bool selected;
  final bool emphasize;
  final VoidCallback? onPressed;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: 66,
      height: 30,
      child: OutlinedButton(
        style: OutlinedButton.styleFrom(
          minimumSize: const Size(66, 30),
          maximumSize: const Size(66, 30),
          padding: const EdgeInsets.symmetric(horizontal: 2, vertical: 0),
          visualDensity: VisualDensity.compact,
          tapTargetSize: MaterialTapTargetSize.shrinkWrap,
          backgroundColor: selected ? kEntryBlueDark : kEntryBlue,
          foregroundColor: selected ? Colors.white : const Color(0xFF0A2C5A),
          side: BorderSide(
            color: selected ? kEntryBlueDark : const Color(0xFF6D95C9),
          ),
          textStyle: const TextStyle(fontSize: 9, fontWeight: FontWeight.w600),
        ),
        onPressed: onPressed,
        child: Text(
          label,
          textAlign: TextAlign.center,
          maxLines: 2,
          overflow: TextOverflow.ellipsis,
        ),
      ),
    );
  }
}

class _MetricText extends StatelessWidget {
  const _MetricText(this.text);

  final String text;

  @override
  Widget build(BuildContext context) {
    return Text(
      text,
      style: const TextStyle(
        fontSize: 10,
        fontWeight: FontWeight.w700,
        color: Color(0xFF1F2937),
      ),
    );
  }
}

class _YesNoToggle extends StatelessWidget {
  const _YesNoToggle({
    required this.value,
    required this.onChanged,
    this.compact = false,
  });

  final bool value;
  final ValueChanged<bool> onChanged;
  final bool compact;

  @override
  Widget build(BuildContext context) {
    return SegmentedButton<bool>(
      style: ButtonStyle(
        backgroundColor: WidgetStateProperty.resolveWith((states) {
          if (states.contains(WidgetState.selected)) {
            return kEntryBlueDark;
          }
          return kEntryBlue;
        }),
        foregroundColor: WidgetStateProperty.resolveWith((states) {
          if (states.contains(WidgetState.selected)) {
            return Colors.white;
          }
          return const Color(0xFF0A2C5A);
        }),
        side: const WidgetStatePropertyAll(BorderSide(color: kEntryBlueDark)),
        visualDensity: compact ? VisualDensity.compact : VisualDensity.standard,
        tapTargetSize: compact
            ? MaterialTapTargetSize.shrinkWrap
            : MaterialTapTargetSize.padded,
        padding: WidgetStatePropertyAll(
          EdgeInsets.symmetric(
            horizontal: compact ? 8 : 12,
            vertical: compact ? 0 : 6,
          ),
        ),
      ),
      segments: [
        ButtonSegment<bool>(
          value: true,
          label: Text('Yes', style: TextStyle(fontSize: compact ? 11 : 13)),
        ),
        ButtonSegment<bool>(
          value: false,
          label: Text('No', style: TextStyle(fontSize: compact ? 11 : 13)),
        ),
      ],
      selected: {value},
      onSelectionChanged: (selected) {
        if (selected.isEmpty) {
          return;
        }
        onChanged(selected.first);
      },
      showSelectedIcon: false,
    );
  }
}

class PostFlightScreen extends StatefulWidget {
  const PostFlightScreen({
    super.key,
    required this.controller,
    required this.sessionId,
  });

  final FalconAppController controller;
  final String sessionId;

  @override
  State<PostFlightScreen> createState() => _PostFlightScreenState();
}

class _PostFlightScreenState extends State<PostFlightScreen> {
  final _formKey = GlobalKey<FormState>();
  final _maxAltitudeController = TextEditingController();
  final _maxDistanceController = TextEditingController();
  final _totalDistanceController = TextEditingController();
  final _maxSpeedController = TextEditingController();
  final _voiceController = TextEditingController();

  final SpeechToText _speech = SpeechToText();
  bool _speechReady = false;
  bool _listening = false;
  bool _saving = false;

  DesiredWeightTrend _desiredWeight = DesiredWeightTrend.same;
  bool _keptOut = true;
  bool _seenInside = false;

  @override
  void initState() {
    super.initState();
    _initSpeech();
  }

  Future<void> _initSpeech() async {
    final available = await _speech.initialize();
    if (!mounted) {
      return;
    }
    setState(() => _speechReady = available);
  }

  @override
  void dispose() {
    _maxAltitudeController.dispose();
    _maxDistanceController.dispose();
    _totalDistanceController.dispose();
    _maxSpeedController.dispose();
    _voiceController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final session = widget.controller.sessionById(widget.sessionId);

    return Scaffold(
      appBar: AppBar(title: const Text('Post-Flight Metrics')),
      body: SafeArea(
        child: Form(
          key: _formKey,
          child: Column(
            children: [
              Expanded(
                child: SingleChildScrollView(
                  padding: const EdgeInsets.fromLTRB(12, 10, 12, 6),
                  child: Column(
                    children: [
                      Card(
                        color: const Color(0xFFEAF5E4),
                        margin: EdgeInsets.zero,
                        child: Padding(
                          padding: const EdgeInsets.all(8),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                'Flying: ${_fmtDuration(widget.controller.flyingMinutes(session))}',
                                style: const TextStyle(fontSize: 12),
                              ),
                              Text(
                                'Sitting: ${_fmtDuration(widget.controller.sittingMinutes(session))}',
                                style: const TextStyle(fontSize: 12),
                              ),
                              Text(
                                'Starling sightings: ${widget.controller.totalStarlingCount(session)}',
                                style: const TextStyle(fontSize: 12),
                              ),
                            ],
                          ),
                        ),
                      ),
                      const SizedBox(height: 8),
                      _metricRow(
                        controller: _maxAltitudeController,
                        label: 'Max altitude (ft)',
                      ),
                      const SizedBox(height: 5),
                      _metricRow(
                        controller: _maxDistanceController,
                        label: 'Max distance from handler (mi)',
                      ),
                      const SizedBox(height: 5),
                      _metricRow(
                        controller: _totalDistanceController,
                        label: 'Total distance flown (mi)',
                      ),
                      const SizedBox(height: 5),
                      _metricRow(
                        controller: _maxSpeedController,
                        label: 'Max speed (mph)',
                      ),
                      const SizedBox(height: 8),
                      Row(
                        crossAxisAlignment: CrossAxisAlignment.center,
                        children: [
                          const Expanded(
                            child: Text(
                              'Desired weight tomorrow',
                              style: TextStyle(
                                fontWeight: FontWeight.w600,
                                fontSize: 12,
                              ),
                            ),
                          ),
                          const SizedBox(width: 8),
                          Wrap(
                            spacing: 4,
                            children: DesiredWeightTrend.values
                                .map(
                                  (value) => ChoiceChip(
                                    materialTapTargetSize:
                                        MaterialTapTargetSize.shrinkWrap,
                                    visualDensity: VisualDensity.compact,
                                    padding: const EdgeInsets.symmetric(
                                      horizontal: 6,
                                      vertical: 0,
                                    ),
                                    label: Text(
                                      _desiredWeightLabel(value),
                                      style: const TextStyle(fontSize: 11),
                                    ),
                                    selected: _desiredWeight == value,
                                    onSelected: (_) =>
                                        setState(() => _desiredWeight = value),
                                  ),
                                )
                                .toList(),
                          ),
                        ],
                      ),
                      const SizedBox(height: 6),
                      _binaryRow(
                        label:
                            'Kept starlings out of property for full session?',
                        value: _keptOut,
                        onChanged: (value) => setState(() => _keptOut = value),
                      ),
                      const SizedBox(height: 6),
                      _binaryRow(
                        label:
                            'Did you see starlings inside field boundary during flight session?',
                        value: _seenInside,
                        onChanged: (value) =>
                            setState(() => _seenInside = value),
                      ),
                      const SizedBox(height: 8),
                      Row(
                        children: [
                          const Expanded(
                            child: Text(
                              'Voice Flight Narrative',
                              style: TextStyle(
                                fontWeight: FontWeight.w600,
                                fontSize: 12,
                              ),
                            ),
                          ),
                          FilledButton.tonalIcon(
                            onPressed: _speechReady ? _toggleListening : null,
                            style: FilledButton.styleFrom(
                              visualDensity: VisualDensity.compact,
                              tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                            ),
                            icon: Icon(_listening ? Icons.stop : Icons.mic),
                            label: Text(_listening ? 'Stop' : 'Record'),
                          ),
                        ],
                      ),
                      if (!_speechReady)
                        const Padding(
                          padding: EdgeInsets.only(top: 4),
                          child: Align(
                            alignment: Alignment.centerLeft,
                            child: Text(
                              'Speech unavailable. Type manually.',
                              style: TextStyle(fontSize: 11),
                            ),
                          ),
                        ),
                      const SizedBox(height: 6),
                      TextFormField(
                        controller: _voiceController,
                        minLines: 2,
                        maxLines: 2,
                        style: const TextStyle(fontSize: 12),
                        decoration: const InputDecoration(
                          border: OutlineInputBorder(),
                          isDense: true,
                          contentPadding: EdgeInsets.symmetric(
                            horizontal: 8,
                            vertical: 8,
                          ),
                          hintText: 'Describe flight quality and behavior...',
                        ),
                        validator: (value) {
                          if ((value ?? '').trim().isEmpty) {
                            return 'Enter a voice/text narrative.';
                          }
                          return null;
                        },
                      ),
                    ],
                  ),
                ),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(12, 4, 12, 10),
                child: FilledButton.icon(
                  style: FilledButton.styleFrom(
                    minimumSize: const Size.fromHeight(42),
                  ),
                  onPressed: _saving ? null : _save,
                  icon: const Icon(Icons.save),
                  label: Text(_saving ? 'Saving...' : 'Save Session'),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _metricRow({
    required TextEditingController controller,
    required String label,
  }) {
    return Row(
      children: [
        Expanded(
          child: Text(
            label,
            style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600),
          ),
        ),
        const SizedBox(width: 8),
        SizedBox(
          width: 78,
          child: TextFormField(
            controller: controller,
            keyboardType: const TextInputType.numberWithOptions(decimal: true),
            textAlign: TextAlign.center,
            decoration: const InputDecoration(
              border: OutlineInputBorder(),
              isDense: true,
              contentPadding: EdgeInsets.symmetric(horizontal: 6, vertical: 8),
            ),
            validator: (value) {
              final parsed = double.tryParse(value ?? '');
              if (parsed == null || parsed < 0) {
                return ' ';
              }
              return null;
            },
          ),
        ),
      ],
    );
  }

  Widget _binaryRow({
    required String label,
    required bool value,
    required ValueChanged<bool> onChanged,
  }) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Expanded(
          child: Text(
            label,
            style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600),
          ),
        ),
        const SizedBox(width: 8),
        _YesNoToggle(value: value, compact: true, onChanged: onChanged),
      ],
    );
  }

  Future<void> _toggleListening() async {
    if (_listening) {
      await _speech.stop();
      setState(() => _listening = false);
      return;
    }

    final ok = await _speech.listen(
      onResult: (result) {
        _voiceController.text = result.recognizedWords;
        _voiceController.selection = TextSelection.fromPosition(
          TextPosition(offset: _voiceController.text.length),
        );
      },
    );

    setState(() => _listening = ok);
  }

  Future<void> _save() async {
    if (!_formKey.currentState!.validate()) {
      return;
    }

    setState(() => _saving = true);

    if (_listening) {
      await _speech.stop();
      _listening = false;
    }

    await widget.controller.endSession(
      sessionId: widget.sessionId,
      input: SessionPostFlightInput(
        maxAltitudeFt: double.parse(_maxAltitudeController.text.trim()),
        maxDistanceFromHandlerMiles: double.parse(
          _maxDistanceController.text.trim(),
        ),
        totalDistanceFlownMiles: double.parse(
          _totalDistanceController.text.trim(),
        ),
        maxSpeedMph: double.parse(_maxSpeedController.text.trim()),
        desiredWeight: _desiredWeight,
        keptStarlingsOut: _keptOut,
        starlingsSeenInsideBoundary: _seenInside,
        voiceTranscript: _voiceController.text.trim(),
      ),
    );

    if (!mounted) {
      return;
    }

    Navigator.of(context).popUntil((route) => route.isFirst);
  }
}

class BeforeBedScreen extends StatefulWidget {
  const BeforeBedScreen({super.key, required this.controller, this.sessionId});

  final FalconAppController controller;
  final String? sessionId;

  @override
  State<BeforeBedScreen> createState() => _BeforeBedScreenState();
}

class _BeforeBedScreenState extends State<BeforeBedScreen> {
  static const List<String> _items = [
    'Set two alarms for one hour before sunrise.',
    'Charge all telemetry batteries.',
    'Plug in iPhone and PocketLink.',
    'Thaw quail for tomorrow\'s flying sessions.',
    'Clean out quail feeding tray and bag.',
    'Make sure falcons have clean water and clean litter. Change water on even days.',
    'Fill up ATV with gas if tank is below 3/4.',
    'Go to bed by 8:15 p.m.',
  ];

  late final List<bool> _checks = List<bool>.filled(_items.length, false);
  bool _scheduling = false;
  SunriseAlarmPlan? _plan;
  String? _scheduleError;
  bool _alarmsScheduled = false;

  bool get _allChecked => _checks.every((v) => v);

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Before Bed')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          const Text(
            'Complete each item before bed. This checklist is prompted nightly at 8:00 PM.',
            style: TextStyle(fontSize: 12, color: Colors.black54),
          ),
          const SizedBox(height: 10),
          ...List.generate(_items.length, (index) {
            return Card(
              margin: const EdgeInsets.only(bottom: 8),
              child: CheckboxListTile(
                value: _checks[index],
                onChanged: (value) => _onCheck(index, value ?? false),
                controlAffinity: ListTileControlAffinity.leading,
                title: Text(
                  '${index + 1}. ${_items[index]}',
                  style: const TextStyle(fontSize: 12.5),
                ),
              ),
            );
          }),
          if (_scheduling)
            const Padding(
              padding: EdgeInsets.only(top: 8),
              child: LinearProgressIndicator(minHeight: 2),
            ),
          if (_scheduleError != null)
            Padding(
              padding: const EdgeInsets.only(top: 8),
              child: Text(
                _scheduleError!,
                style: const TextStyle(
                  color: Color(0xFF842029),
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
          if (_plan != null)
            Padding(
              padding: const EdgeInsets.only(top: 8),
              child: Text(
                'Sunrise ${_fmtTime(_plan!.sunriseAt)}. Alarms set for ${_fmtTime(_plan!.firstAlarmAt)} and ${_fmtTime(_plan!.secondAlarmAt)}.',
                style: const TextStyle(
                  color: Color(0xFF1E5E2D),
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
          const SizedBox(height: 12),
          FilledButton(
            onPressed: _allChecked ? _done : null,
            child: const Text('Done'),
          ),
        ],
      ),
    );
  }

  Future<void> _onCheck(int index, bool checked) async {
    setState(() {
      _checks[index] = checked;
      _scheduleError = null;
    });
    if (_allChecked && !_alarmsScheduled && !_scheduling) {
      await _scheduleSunriseAlarms();
    }
  }

  Future<void> _scheduleSunriseAlarms() async {
    setState(() => _scheduling = true);
    try {
      final plan = await NotificationService.instance
          .scheduleSunriseAlarmsForNextFlightMorning();
      if (!mounted) {
        return;
      }
      setState(() {
        _plan = plan;
        _alarmsScheduled = true;
      });
    } catch (error) {
      if (!mounted) {
        return;
      }
      setState(() {
        _scheduleError =
            'Could not schedule sunrise alarms. Enable location and notification permissions, then try again.';
      });
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text(error.toString())));
    } finally {
      if (mounted) {
        setState(() => _scheduling = false);
      }
    }
  }

  void _done() {
    final sessionId = widget.sessionId;
    final isAdmin = widget.controller.currentUser?.role == UserRole.manager;

    if (sessionId != null && isAdmin) {
      Navigator.of(context).pushAndRemoveUntil(
        MaterialPageRoute(
          builder: (_) => SessionSummaryScreen(
            controller: widget.controller,
            sessionId: sessionId,
          ),
        ),
        (route) => route.isFirst,
      );
      return;
    }

    Navigator.of(context).popUntil((route) => route.isFirst);
  }
}

class SessionSummaryScreen extends StatelessWidget {
  const SessionSummaryScreen({
    super.key,
    required this.controller,
    required this.sessionId,
  });

  final FalconAppController controller;
  final String sessionId;

  @override
  Widget build(BuildContext context) {
    final isAdmin = controller.currentUser?.role == UserRole.manager;
    if (!isAdmin) {
      return Scaffold(
        appBar: AppBar(title: const Text('Session Summary')),
        body: const Center(
          child: Padding(
            padding: EdgeInsets.all(16),
            child: Text(
              'Session summary data is restricted to admin users.',
              textAlign: TextAlign.center,
            ),
          ),
        ),
      );
    }

    final session = controller.sessionById(sessionId);
    final falcon = controller.falconById(session.falconId);
    final field = controller.fieldById(session.fieldId);
    final foodUsed = controller.foodUsedG(session);
    final foodRemaining = controller.foodRemainingG(session);

    final insideCount = session.events
        .where(
          (e) =>
              e.type == SessionEventType.starling &&
              e.boundaryClass == BoundaryClass.inside,
        )
        .length;
    final perimeterCount = session.events
        .where(
          (e) =>
              e.type == SessionEventType.starling &&
              e.boundaryClass == BoundaryClass.perimeter,
        )
        .length;
    final outsideCount = session.events
        .where(
          (e) =>
              e.type == SessionEventType.starling &&
              e.boundaryClass == BoundaryClass.outside,
        )
        .length;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Session Summary'),
        actions: [
          IconButton(
            tooltip: 'Mark synced',
            onPressed: () async {
              await controller.markSessionSynced(sessionId);
              if (context.mounted) {
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(content: Text('Session marked as synced.')),
                );
              }
            },
            icon: Icon(session.synced ? Icons.cloud_done : Icons.cloud_upload),
          ),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Card(
            child: Padding(
              padding: const EdgeInsets.all(12),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    '${falcon.name} · ${field.name}',
                    style: const TextStyle(
                      fontWeight: FontWeight.bold,
                      fontSize: 16,
                    ),
                  ),
                  Text(
                    'Handler: ${controller.handlerById(session.handlerId).name}',
                  ),
                  if (session.localWeather.isNotEmpty)
                    Text('Local weather: ${session.localWeather.join(', ')}'),
                  Text('Start: ${_fmtDate(session.startAt)}'),
                  Text('End: ${_fmtDate(session.endAt)}'),
                  const SizedBox(height: 8),
                  Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: [
                      _SummaryChip(label: 'Food Used', value: '${foodUsed}g'),
                      _SummaryChip(
                        label: 'Food Remaining',
                        value: '${foodRemaining}g',
                      ),
                      _SummaryChip(
                        label: 'Flights',
                        value: '${controller.completedFlights(session)}',
                      ),
                      _SummaryChip(
                        label: 'Flying',
                        value: _fmtDuration(controller.flyingMinutes(session)),
                      ),
                      _SummaryChip(
                        label: 'Sitting',
                        value: _fmtDuration(controller.sittingMinutes(session)),
                      ),
                      _SummaryChip(
                        label: 'Starling Total',
                        value: '${controller.totalStarlingCount(session)}',
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 12),
          Card(
            child: Padding(
              padding: const EdgeInsets.all(12),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    'Pursuit Outcomes',
                    style: TextStyle(fontWeight: FontWeight.bold),
                  ),
                  const SizedBox(height: 6),
                  Text(
                    'Catch: ${controller.pursuitOutcomeCount(session, PursuitOutcome.kill)}',
                  ),
                  Text(
                    'Ignore: ${controller.pursuitOutcomeCount(session, PursuitOutcome.ignore)}',
                  ),
                  Text(
                    'Chase: ${controller.pursuitOutcomeCount(session, PursuitOutcome.chase)}',
                  ),
                  const SizedBox(height: 10),
                  const Text(
                    'Starling Boundary Classifications',
                    style: TextStyle(fontWeight: FontWeight.bold),
                  ),
                  const SizedBox(height: 6),
                  Text('Inside: $insideCount'),
                  Text('Perimeter: $perimeterCount'),
                  Text('Outside: $outsideCount'),
                ],
              ),
            ),
          ),
          const SizedBox(height: 12),
          Card(
            child: Padding(
              padding: const EdgeInsets.all(12),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    'Post-Flight Inputs',
                    style: TextStyle(fontWeight: FontWeight.bold),
                  ),
                  const SizedBox(height: 6),
                  Text(
                    'Max altitude: ${session.maxAltitudeFt?.toStringAsFixed(1) ?? '-'} ft',
                  ),
                  Text(
                    'Max distance from handler: ${session.maxDistanceFromHandlerMiles?.toStringAsFixed(2) ?? '-'} mi',
                  ),
                  Text(
                    'Total distance flown: ${session.totalDistanceFlownMiles?.toStringAsFixed(2) ?? '-'} mi',
                  ),
                  Text(
                    'Max speed: ${session.maxSpeedMph?.toStringAsFixed(1) ?? '-'} mph',
                  ),
                  Text(
                    'Desired weight tomorrow: ${_desiredWeightLabel(session.desiredWeight)}',
                  ),
                  Text(
                    'Kept starlings out: ${_yesNo(session.keptStarlingsOut)}',
                  ),
                  Text(
                    'Starlings seen inside boundary: ${_yesNo(session.starlingsSeenInsideBoundary)}',
                  ),
                  const SizedBox(height: 8),
                  const Text(
                    'Narrative',
                    style: TextStyle(fontWeight: FontWeight.bold),
                  ),
                  Text(session.voiceTranscript ?? '-'),
                ],
              ),
            ),
          ),
          const SizedBox(height: 12),
          if (isAdmin) ...[
            const Text(
              'Event Timeline',
              style: TextStyle(fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 6),
            ...session.events.map((event) => _EventTile(event: event)),
          ] else
            const Card(
              child: Padding(
                padding: EdgeInsets.all(12),
                child: Text('Event timeline is restricted to admin users.'),
              ),
            ),
          const SizedBox(height: 16),
          FilledButton.icon(
            onPressed: () {
              Navigator.of(context).popUntil((route) => route.isFirst);
            },
            icon: const Icon(Icons.home),
            label: const Text('Back to Home'),
          ),
        ],
      ),
    );
  }
}

class _FieldBoundaryMapPage extends StatelessWidget {
  const _FieldBoundaryMapPage({required this.field, required this.session});

  final FieldBoundary field;
  final SessionRecord session;

  @override
  Widget build(BuildContext context) {
    final points = field.polygon.map(_toLatLng).toList();
    final center = _polygonCenter(points);
    final starlingEvents = session.events
        .where(
          (event) =>
              event.type == SessionEventType.starling &&
              event.lat != null &&
              event.lng != null &&
              event.starlingCount != null,
        )
        .toList();

    return ListView(
      padding: const EdgeInsets.all(12),
      children: [
        Card(
          child: Padding(
            padding: const EdgeInsets.all(12),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'Field Boundary Map',
                  style: TextStyle(fontWeight: FontWeight.bold),
                ),
                const SizedBox(height: 6),
                Text(field.name),
                const SizedBox(height: 10),
                SizedBox(
                  height: 220,
                  child: ClipRRect(
                    borderRadius: BorderRadius.circular(10),
                    child: FlutterMap(
                      options: MapOptions(
                        initialCenter: center,
                        initialZoom: 15.8,
                      ),
                      children: [
                        TileLayer(
                          urlTemplate:
                              'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
                          userAgentPackageName:
                              'com.gettypollard.starlingPursuit',
                        ),
                        PolygonLayer(
                          polygons: [
                            Polygon(
                              points: points,
                              color: const Color(0x553EA845),
                              borderColor: const Color(0xFF1D6A24),
                              borderStrokeWidth: 2.0,
                            ),
                          ],
                        ),
                        CircleLayer(
                          circles: starlingEvents
                              .map(
                                (event) => CircleMarker(
                                  point: LatLng(event.lat!, event.lng!),
                                  radius: _starlingDotRadius(
                                    event.starlingCount!,
                                  ),
                                  color: const Color(0xAA136DDB),
                                  borderColor: const Color(0xFF0A2C5D),
                                  borderStrokeWidth: 1.0,
                                ),
                              )
                              .toList(),
                        ),
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: 8),
                Text(
                  'Perimeter threshold: ${field.perimeterMeters.toStringAsFixed(0)}m',
                  style: const TextStyle(fontSize: 12, color: Colors.black54),
                ),
                const SizedBox(height: 4),
                Text(
                  'Starling dots: ${starlingEvents.length} (larger dot = more starlings)',
                  style: const TextStyle(fontSize: 12, color: Colors.black54),
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }
}

class _PageDot extends StatelessWidget {
  const _PageDot({required this.active});

  final bool active;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: active ? 10 : 8,
      height: active ? 10 : 8,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        color: active ? const Color(0xFF1D6A24) : Colors.black26,
      ),
    );
  }
}

class _SummaryChip extends StatelessWidget {
  const _SummaryChip({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Chip(
      label: Text('$label: $value'),
      backgroundColor: const Color(0xFFEAF5E4),
    );
  }
}

LatLng _toLatLng(GeoPoint point) => LatLng(point.lat, point.lng);

LatLng _polygonCenter(List<LatLng> points) {
  if (points.isEmpty) {
    return const LatLng(0, 0);
  }

  final lat =
      points.map((p) => p.latitude).reduce((a, b) => a + b) / points.length;
  final lng =
      points.map((p) => p.longitude).reduce((a, b) => a + b) / points.length;
  return LatLng(lat, lng);
}

double _starlingDotRadius(int count) {
  final normalized = math.sqrt(count.toDouble());
  return (3.0 + (normalized * 0.45)).clamp(4.0, 18.0);
}

class _EventTile extends StatelessWidget {
  const _EventTile({required this.event});

  final SessionEvent event;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: ListTile(
        title: Text(_eventTitle(event)),
        subtitle: Text(_eventSubtitle(event)),
        trailing: Text(DateFormat('h:mm:ss a').format(event.at)),
      ),
    );
  }
}

String _eventTitle(SessionEvent event) {
  switch (event.type) {
    case SessionEventType.starling:
      return 'Starling sighting: ${event.starlingCount ?? 0}';
    case SessionEventType.flyingStart:
      final mode = event.note;
      if (mode != null && mode.isNotEmpty) {
        return mode;
      }
      return 'Falcon flying';
    case SessionEventType.flyingEnd:
      return 'Falcon returns';
    case SessionEventType.reward:
      return 'Reward: ${_rewardSizeLabel(event.rewardSize)} (${event.rewardG ?? 0}g)';
    case SessionEventType.pursuit:
      return 'Pursuit: ${_outcomeLabel(event.outcome)}';
    case SessionEventType.alert:
      return 'Alert';
  }
}

String _eventSubtitle(SessionEvent event) {
  switch (event.type) {
    case SessionEventType.starling:
      final location = (event.lat != null && event.lng != null)
          ? '${event.lat!.toStringAsFixed(5)}, ${event.lng!.toStringAsFixed(5)}'
          : 'GPS unavailable';
      final category = event.note;
      if (category != null && category.isNotEmpty) {
        return '$category · ${_boundaryLabel(event.boundaryClass)} · $location';
      }
      return '${_boundaryLabel(event.boundaryClass)} · $location';
    case SessionEventType.pursuit:
      return 'Wingbeat: ${event.wingbeat == null ? '-' : _wingbeatLabel(event.wingbeat!)} · Falcon response: ${_responseToRewardLabel(event.pursuitIntensity)} · Distance: ${_distanceFromHandlerLabel(event.distanceFromHandler)}';
    case SessionEventType.alert:
      return event.note ?? '-';
    default:
      return '-';
  }
}

String _fmtDate(DateTime? value) {
  if (value == null) {
    return '-';
  }
  return DateFormat('MMM d, yyyy h:mm a').format(value);
}

String _fmtDuration(double minutes) {
  final total = minutes.round();
  final h = total ~/ 60;
  final m = total % 60;
  return '${h}h ${m}m';
}

String _fmtTime(DateTime value) {
  return DateFormat('h:mm a').format(value);
}

String _yesNo(bool? value) {
  if (value == null) {
    return '-';
  }
  return value ? 'Yes' : 'No';
}

String _behaviorLabel(FalconBehavior value) {
  switch (value) {
    case FalconBehavior.perch:
      return 'Sitting on Perch';
    case FalconBehavior.baitAway:
      return 'Baiting Away from Handler';
    case FalconBehavior.baitToward:
      return 'Bait Towards Handler';
  }
}

String _wingbeatLabel(WingbeatQuality value) {
  switch (value) {
    case WingbeatQuality.strong:
      return 'Strong';
    case WingbeatQuality.normal:
      return 'Normal';
    case WingbeatQuality.weak:
      return 'Weak';
  }
}

String _responseToRewardLabel(int? value) {
  switch (value) {
    case 1:
      return 'Instant';
    case 2:
      return 'Delayed';
    case 3:
      return 'Fast';
    case null:
      return '-';
    default:
      return '$value';
  }
}

String _distanceFromHandlerLabel(FalconDistanceFromHandler? value) {
  switch (value) {
    case FalconDistanceFromHandler.inView:
      return 'Visible';
    case FalconDistanceFromHandler.outOfSight:
      return 'Out of sight';
    case null:
      return '-';
  }
}

String _rewardSizeLabel(RewardSize? value) {
  switch (value) {
    case RewardSize.small:
      return 'Small';
    case RewardSize.medium:
      return 'Medium';
    case RewardSize.large:
      return 'Large';
    case RewardSize.pickUpPiece:
      return 'Pick up piece';
    case null:
      return '-';
  }
}

String _outcomeLabel(PursuitOutcome? value) {
  switch (value) {
    case PursuitOutcome.kill:
      return 'Catch';
    case PursuitOutcome.chase:
      return 'Chase';
    case PursuitOutcome.ignore:
      return 'Ignore';
    case PursuitOutcome.no:
      return 'No';
    case null:
      return '-';
  }
}

String _desiredWeightLabel(DesiredWeightTrend? value) {
  switch (value) {
    case DesiredWeightTrend.higher:
      return 'Higher';
    case DesiredWeightTrend.same:
      return 'Same';
    case DesiredWeightTrend.lower:
      return 'Lower';
    case null:
      return '-';
  }
}

String _boundaryLabel(BoundaryClass? value) {
  switch (value) {
    case BoundaryClass.inside:
      return 'Inside boundary';
    case BoundaryClass.perimeter:
      return 'Perimeter';
    case BoundaryClass.outside:
      return 'Outside boundary';
    case BoundaryClass.unknown:
      return 'Unknown';
    case null:
      return 'Unknown';
  }
}
