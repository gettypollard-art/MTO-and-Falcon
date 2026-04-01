import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:image_picker/image_picker.dart';
import 'package:speech_to_text/speech_to_text.dart' as stt;
import 'package:shared_preferences/shared_preferences.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  final controller = AppController();
  await controller.loadInitialAssessments();
  runApp(MApp(controller: controller));
}

class MApp extends StatelessWidget {
  const MApp({super.key, required this.controller});

  final AppController controller;

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: controller,
      builder: (context, _) {
        return MaterialApp(
          title: 'M',
          debugShowCheckedModeBanner: false,
          theme: ThemeData(
            colorScheme: ColorScheme.fromSeed(
              seedColor: const Color(0xFF7DBB8A),
            ),
            scaffoldBackgroundColor: const Color(0xFFFFFBE8),
            appBarTheme: const AppBarTheme(
              backgroundColor: Color(0xFFFFF3B8),
              foregroundColor: Color(0xFF254A2E),
            ),
            cardTheme: CardThemeData(
              color: Colors.white,
              elevation: 0.5,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(14),
                side: const BorderSide(color: Color(0xFFD8E5DD)),
              ),
            ),
            navigationBarTheme: NavigationBarThemeData(
              backgroundColor: const Color(0xFFEAF7E3),
              indicatorColor: const Color(0xFFCFEEC5),
              labelTextStyle: WidgetStateProperty.resolveWith((states) {
                final selected = states.contains(WidgetState.selected);
                return TextStyle(
                  color: selected
                      ? const Color(0xFF20532F)
                      : const Color(0xFF4F6B55),
                  fontWeight: selected ? FontWeight.w700 : FontWeight.w600,
                );
              }),
            ),
            useMaterial3: true,
          ),
          home: AppShell(controller: controller),
        );
      },
    );
  }
}

class AppShell extends StatefulWidget {
  const AppShell({super.key, required this.controller});

  final AppController controller;

  @override
  State<AppShell> createState() => _AppShellState();
}

class _AppShellState extends State<AppShell> {
  int _tabIndex = 0;

  @override
  Widget build(BuildContext context) {
    final controller = widget.controller;
    final canAdmin = controller.selectedRole.canAdmin;
    final canPlan = controller.selectedRole.canPlan;

    final pages = <Widget>[
      WeeklyAssessmentPage(controller: controller),
      if (canPlan) CalendarOverviewPage(controller: controller),
      if (canAdmin) AdminAssessmentsPage(controller: controller),
    ];

    if (_tabIndex >= pages.length) {
      _tabIndex = 0;
    }

    return Scaffold(
      appBar: AppBar(
        leading: IconButton(
          tooltip: 'Back',
          onPressed: _tabIndex == 0
              ? null
              : () {
                  setState(() {
                    _tabIndex = (_tabIndex - 1).clamp(0, pages.length - 1);
                  });
                },
          icon: const Icon(Icons.arrow_back),
        ),
        actions: [
          if (!controller.isLoading)
            IconButton(
              tooltip: 'Resources',
              onPressed: () {
                showResourcesDialog(context);
              },
              icon: const Icon(Icons.menu_book_outlined),
            ),
          if (!controller.isLoading &&
              controller.selectedRole == UserRole.producer &&
              controller.overflowTasks.isNotEmpty)
            IconButton(
              tooltip: 'Overflow Tasks of the Week',
              onPressed: () {
                showOverflowTasksDialog(context, controller);
              },
              icon: const Icon(Icons.playlist_add_check_circle_outlined),
            ),
          if (!controller.isLoading &&
              controller.selectedRole == UserRole.producer &&
              controller.closingTasksForActiveTrack().isNotEmpty)
            IconButton(
              tooltip: 'Closing Tasks',
              onPressed: () {
                showClosingTasksDialog(context, controller);
              },
              icon: const Icon(Icons.task_alt),
            ),
          if (!controller.isLoading)
            IconButton(
              tooltip: 'Inbox',
              onPressed: () {
                showDialog<void>(
                  context: context,
                  builder: (context) => InboxDialog(controller: controller),
                );
              },
              icon: Stack(
                clipBehavior: Clip.none,
                children: [
                  const Icon(Icons.inbox_outlined),
                  if (controller.unreadInboxCountForSelectedRole > 0)
                    Positioned(
                      right: -6,
                      top: -6,
                      child: Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 5,
                          vertical: 1,
                        ),
                        decoration: BoxDecoration(
                          color: Theme.of(context).colorScheme.error,
                          borderRadius: BorderRadius.circular(10),
                        ),
                        child: Text(
                          controller.unreadInboxCountForSelectedRole > 99
                              ? '99+'
                              : '${controller.unreadInboxCountForSelectedRole}',
                          style: TextStyle(
                            color: Theme.of(context).colorScheme.onError,
                            fontSize: 10,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      ),
                    ),
                ],
              ),
            ),
          if (!controller.isLoading && controller.selectedRole.canPlan)
            IconButton(
              tooltip: 'Start Next Week',
              onPressed: () async {
                final shouldStart = await showDialog<bool>(
                  context: context,
                  builder: (context) {
                    return AlertDialog(
                      title: const Text('Start Next Week'),
                      content: Text(
                        'Move to next week for ${controller.activeTrack.label}?\n'
                        'Unfinished and overflow assessments will carry over.',
                      ),
                      actions: [
                        TextButton(
                          onPressed: () {
                            Navigator.of(context).pop(false);
                          },
                          child: const Text('Cancel'),
                        ),
                        FilledButton(
                          onPressed: () {
                            Navigator.of(context).pop(true);
                          },
                          child: const Text('Start'),
                        ),
                      ],
                    );
                  },
                );

                if (shouldStart != true) {
                  return;
                }

                controller.startNextWeek();
                if (!context.mounted) {
                  return;
                }
                ScaffoldMessenger.of(context).showSnackBar(
                  SnackBar(
                    content: Text(
                      'Now planning ${controller.weekLabel} for ${controller.activeTrack.label}.',
                    ),
                  ),
                );
              },
              icon: const Icon(Icons.next_week),
            ),
          if (!controller.isLoading && controller.selectedRole == UserRole.ceo)
            PopupMenuButton<AssessmentTrack>(
              tooltip: 'CEO View',
              onSelected: controller.setCeoTrack,
              itemBuilder: (context) {
                return AssessmentTrack.values
                    .map(
                      (track) => PopupMenuItem<AssessmentTrack>(
                        value: track,
                        child: Text(track.label),
                      ),
                    )
                    .toList();
              },
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 8),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(controller.ceoTrack.label),
                    const Icon(Icons.arrow_drop_down),
                  ],
                ),
              ),
            ),
          PopupMenuButton<UserRole>(
            tooltip: 'Select Role',
            onSelected: (role) {
              setState(() {
                _tabIndex = 0;
              });
              controller.setRole(role);
            },
            itemBuilder: (context) {
              return UserRole.values
                  .map(
                    (role) => PopupMenuItem<UserRole>(
                      value: role,
                      child: Text(role.label),
                    ),
                  )
                  .toList();
            },
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 12),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(controller.selectedRole.label),
                  const Icon(Icons.arrow_drop_down),
                ],
              ),
            ),
          ),
        ],
      ),
      body: controller.isLoading
          ? const Center(child: CircularProgressIndicator())
          : pages[_tabIndex],
      bottomNavigationBar: controller.isLoading
          ? null
          : (pages.length == 2
                ? NavigationBar(
                    selectedIndex: _tabIndex == 0 ? 0 : 2,
                    onDestinationSelected: (index) {
                      if (index == 1) {
                        showDialog<void>(
                          context: context,
                          builder: (context) => WeeklyCalendarDialog(
                            controller: controller,
                            editable: controller.selectedRole.canPlan,
                          ),
                        );
                        return;
                      }
                      setState(() {
                        _tabIndex = index == 0 ? 0 : 1;
                      });
                    },
                    destinations: [
                      const NavigationDestination(
                        icon: Icon(Icons.assignment_turned_in_outlined),
                        selectedIcon: Icon(Icons.assignment_turned_in),
                        label: 'Plan Weekly Tasks',
                      ),
                      NavigationDestination(
                        icon: Container(
                          width: 44,
                          height: 44,
                          decoration: BoxDecoration(
                            color: const Color(0xFF1565C0),
                            borderRadius: BorderRadius.circular(14),
                          ),
                          child: const Icon(
                            Icons.calendar_month,
                            color: Colors.white,
                          ),
                        ),
                        selectedIcon: Container(
                          width: 44,
                          height: 44,
                          decoration: BoxDecoration(
                            color: const Color(0xFF1565C0),
                            borderRadius: BorderRadius.circular(14),
                          ),
                          child: const Icon(
                            Icons.calendar_month,
                            color: Colors.white,
                          ),
                        ),
                        label: 'This Week',
                      ),
                      const NavigationDestination(
                        icon: Icon(Icons.calendar_view_month_outlined),
                        selectedIcon: Icon(Icons.calendar_view_month),
                        label: 'Calendar',
                      ),
                    ],
                  )
                : (pages.length > 1
                      ? NavigationBar(
                          selectedIndex: _tabIndex,
                          onDestinationSelected: (index) {
                            setState(() {
                              _tabIndex = index;
                            });
                          },
                          destinations: [
                            const NavigationDestination(
                              icon: Icon(Icons.assignment_turned_in_outlined),
                              selectedIcon: Icon(Icons.assignment_turned_in),
                              label: 'Plan Weekly Tasks',
                            ),
                            if (canPlan)
                              const NavigationDestination(
                                icon: Icon(Icons.calendar_view_month_outlined),
                                selectedIcon: Icon(Icons.calendar_view_month),
                                label: 'Calendar',
                              ),
                            if (canAdmin)
                              const NavigationDestination(
                                icon: Icon(
                                  Icons.admin_panel_settings_outlined,
                                ),
                                selectedIcon: Icon(Icons.admin_panel_settings),
                                label: 'Admin Assessments',
                              ),
                          ],
                        )
                      : null)),
    );
  }
}

Future<void> showResourcesDialog(BuildContext context) async {
  await showDialog<void>(
    context: context,
    builder: (context) {
      return AlertDialog(
        title: const Text('Resources'),
        content: const SizedBox(
          width: 460,
          child: Text(
            'Resources will appear here. Send the documents you want added.',
          ),
        ),
        actions: [
          TextButton(
            onPressed: () {
              Navigator.of(context).pop();
            },
            child: const Text('Close'),
          ),
        ],
      );
    },
  );
}

class WeeklyAssessmentPage extends StatefulWidget {
  const WeeklyAssessmentPage({super.key, required this.controller});

  final AppController controller;

  @override
  State<WeeklyAssessmentPage> createState() => _WeeklyAssessmentPageState();
}

class _WeeklyAssessmentPageState extends State<WeeklyAssessmentPage> {
  bool _showScheduledGlobally = false;

  AppController get controller => widget.controller;

  bool _isScheduled(String templateId) {
    return controller.findThisWeekRequest(templateId) != null ||
        controller.findExplicitNextWeekTask(templateId) != null;
  }

  @override
  Widget build(BuildContext context) {
    final rawTemplatesByRoom = controller.templatesByRoomForActiveTrack();
    final canPlan = controller.selectedRole.canPlan;
    final notNeededIds = controller.notNeededTemplateIdsForActiveTrack;
    final isProducer = controller.selectedRole == UserRole.producer;
    final templatesByRoom = <String, List<AssessmentTemplate>>{};
    for (final entry in rawTemplatesByRoom.entries) {
      final filtered = entry.value.where((template) {
        if (isProducer &&
            entry.key == 'OTHER' &&
            template.category == 'Closing Duties') {
          return false;
        }
        if (_showScheduledGlobally) {
          return !_isScheduled(template.id);
        }
        return !_isScheduled(template.id) &&
            !notNeededIds.contains(template.id);
      }).toList();
      if (filtered.isNotEmpty || _showScheduledGlobally) {
        templatesByRoom[entry.key] = filtered;
      }
    }

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        _SummaryCard(controller: controller),
        const SizedBox(height: 16),
        if (!canPlan)
          Card(
            child: Padding(
              padding: const EdgeInsets.all(12),
              child: Text(
                'Read-only role: only planning roles can assign assessments.',
                style: Theme.of(context).textTheme.bodyMedium,
              ),
            ),
          ),
        const SizedBox(height: 8),
        Row(
          children: [
            Expanded(
              child: Text(
                'Tasks by Room',
                style: Theme.of(context).textTheme.titleMedium,
              ),
            ),
            OutlinedButton(
              onPressed: () {
                setState(() {
                  _showScheduledGlobally = !_showScheduledGlobally;
                });
              },
              child: Text(
                _showScheduledGlobally
                    ? 'Show unscheduled tasks'
                    : 'Show all tasks',
              ),
            ),
          ],
        ),
        const SizedBox(height: 8),
        ...templatesByRoom.entries.map((entry) {
          return Card(
            margin: const EdgeInsets.only(bottom: 10),
            child: ExpansionTile(
              title: Text(entry.key),
              subtitle: Text('${entry.value.length} Tasks'),
              children: entry.value.asMap().entries.map((item) {
                final index = item.key;
                final template = item.value;
                return _AssessmentTile(
                  controller: controller,
                  template: template,
                  canPlan: canPlan,
                  displayNumber: index + 1,
                );
              }).toList(),
            ),
          );
        }),
      ],
    );
  }

}

Future<void> showClosingTasksDialog(
  BuildContext context,
  AppController controller,
) async {
  await showDialog<void>(
    context: context,
    builder: (context) {
      return AnimatedBuilder(
        animation: controller,
        builder: (context, _) {
          final tasks = controller.closingTasksForActiveTrack();
          final completedCount = tasks
              .where((task) => controller.isClosingTaskChecked(task.id))
              .length;
          return AlertDialog(
            title: Text('Closing Tasks ($completedCount/${tasks.length})'),
            content: SizedBox(
              width: 520,
              child: tasks.isEmpty
                  ? const Text('No closing tasks configured.')
                  : ListView.builder(
                      shrinkWrap: true,
                      itemCount: tasks.length,
                      itemBuilder: (context, index) {
                        final task = tasks[index];
                        final checked = controller.isClosingTaskChecked(task.id);
                        return CheckboxListTile(
                          value: checked,
                          onChanged: (value) {
                            controller.setClosingTaskChecked(
                              task.id,
                              value ?? false,
                            );
                          },
                          title: Text(task.title),
                          subtitle: Text(
                            'P${task.priority} • ${task.defaultHours.toStringAsFixed(1)}h',
                          ),
                          controlAffinity: ListTileControlAffinity.leading,
                          contentPadding: EdgeInsets.zero,
                        );
                      },
                    ),
            ),
            actions: [
              TextButton(
                onPressed: () {
                  Navigator.of(context).pop();
                },
                child: const Text('Back'),
              ),
            ],
          );
        },
      );
    },
  );
}

Future<void> showOverflowTasksDialog(
  BuildContext context,
  AppController controller,
) async {
  await showDialog<void>(
    context: context,
    builder: (context) {
      return AnimatedBuilder(
        animation: controller,
        builder: (context, _) {
          final tasks = controller.overflowTasks;
          final completedCount = tasks.where((task) => task.completed).length;
          return AlertDialog(
            title: Text(
              'Overflow Tasks of the Week ($completedCount/${tasks.length})',
            ),
            content: SizedBox(
              width: 560,
              child: tasks.isEmpty
                  ? const Text('No overflow tasks this week.')
                  : ListView.separated(
                      shrinkWrap: true,
                      itemCount: tasks.length,
                      separatorBuilder: (_, _) => const Divider(height: 10),
                      itemBuilder: (context, index) {
                        final task = tasks[index];
                        return CheckboxListTile(
                          value: task.completed,
                          onChanged: (value) {
                            controller.toggleOverflowTaskCompletion(
                              task.id,
                              value ?? false,
                            );
                          },
                          title: Text(task.title),
                          subtitle: Text(
                            '${task.room} • P${task.priority} • ${task.estimatedHours.toStringAsFixed(1)}h',
                          ),
                          controlAffinity: ListTileControlAffinity.leading,
                          contentPadding: EdgeInsets.zero,
                        );
                      },
                    ),
            ),
            actions: [
              TextButton(
                onPressed: () {
                  Navigator.of(context).pop();
                },
                child: const Text('Back'),
              ),
            ],
          );
        },
      );
    },
  );
}

class _SummaryCard extends StatelessWidget {
  const _SummaryCard({required this.controller});

  final AppController controller;

  @override
  Widget build(BuildContext context) {
    final weekLoad = controller.weekLoad;

    return Card(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(12, 10, 12, 10),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Scheduled Weekly Tasks Summary',
              style: Theme.of(context).textTheme.titleMedium,
            ),
            const SizedBox(height: 6),
            Text(
              '${controller.activeTrack.label} • ${controller.selectedRole.label}',
              style: Theme.of(context).textTheme.bodySmall,
            ),
            const SizedBox(height: 2),
            Row(
              children: [
                IconButton(
                  tooltip: 'Previous week',
                  onPressed: controller.moveOneWeekBackward,
                  icon: const Icon(Icons.chevron_left),
                ),
                Expanded(
                  child: Text(
                    controller.weekLabel,
                    textAlign: TextAlign.center,
                    style: Theme.of(context).textTheme.bodySmall,
                  ),
                ),
                IconButton(
                  tooltip: 'Next week',
                  onPressed: controller.moveOneWeekForward,
                  icon: const Icon(Icons.chevron_right),
                ),
              ],
            ),
            const SizedBox(height: 8),
            LinearProgressIndicator(
              value: (weekLoad / AppController.weekHourLimit).clamp(0.0, 1.0),
            ),
            const SizedBox(height: 8),
            Row(
              children: List.generate(5, (index) {
                final day = AppController.dayLabels[index];
                final shortDay = day.substring(0, 3);
                final hours = controller.dayLoad(index);
                return Expanded(
                  child: Container(
                    margin: EdgeInsets.only(right: index == 4 ? 0 : 6),
                    padding: const EdgeInsets.symmetric(
                      horizontal: 6,
                      vertical: 6,
                    ),
                    decoration: BoxDecoration(
                      borderRadius: BorderRadius.circular(10),
                      color: const Color(0xFFF7FBF8),
                      border: Border.all(color: const Color(0xFFD6E5DC)),
                    ),
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text(
                          shortDay,
                          style: Theme.of(context).textTheme.labelMedium,
                        ),
                        const SizedBox(height: 2),
                        Row(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            const Icon(Icons.schedule, size: 12),
                            const SizedBox(width: 3),
                            Text(
                              '${hours.toStringAsFixed(1)}h',
                              style: Theme.of(context).textTheme.labelSmall,
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),
                );
              }),
            ),
          ],
        ),
      ),
    );
  }
}

class _AssessmentTile extends StatelessWidget {
  const _AssessmentTile({
    required this.controller,
    required this.template,
    required this.canPlan,
    required this.displayNumber,
  });

  final AppController controller;
  final AssessmentTemplate template;
  final bool canPlan;
  final int displayNumber;

  @override
  Widget build(BuildContext context) {
    final thisWeekPlan = controller.findThisWeekRequest(template.id);
    final nextWeekPlan = controller.findExplicitNextWeekTask(template.id);

    String status = 'Not planned';
    if (thisWeekPlan != null) {
      status = 'Planned this week';
    } else if (nextWeekPlan != null) {
      status = 'Planned for next week';
    }

    return Column(
      children: [
        ListTile(
          title: Text('$displayNumber. ${template.title}'),
          subtitle: Text(
            '${controller.displayCategoryName(template.category)} • Priority ${template.priority} • Default ${template.defaultHours.toStringAsFixed(1)}h\n$status',
          ),
          isThreeLine: true,
          trailing: canPlan
              ? IconButton(
                  tooltip: 'Plan',
                  onPressed: () {
                    _showPlanSheet(context, controller, template);
                  },
                  icon: const Icon(Icons.schedule_send),
                )
              : const Icon(Icons.lock_outline),
          onTap: canPlan
              ? () {
                  _showPlanSheet(context, controller, template);
                }
              : null,
        ),
        if (canPlan)
          Padding(
            padding: const EdgeInsets.only(left: 16, right: 16, bottom: 8),
            child: Align(
              alignment: Alignment.centerLeft,
              child: FilledButton.tonal(
                onPressed: () {
                  controller.setTemplateNotNeededThisWeek(template.id, true);
                },
                child: const Text('Not needed this week'),
              ),
            ),
          ),
      ],
    );
  }

  Future<void> _showPlanSheet(
    BuildContext pageContext,
    AppController controller,
    AssessmentTemplate template,
  ) async {
    final existingThisWeek = controller.findThisWeekRequest(template.id);
    final existingNextWeek = controller.findExplicitNextWeekTask(template.id);

    var forNextWeek = existingNextWeek != null && existingThisWeek == null;
    var selectedDay =
        existingThisWeek?.preferredDay ?? existingNextWeek?.day ?? 0;
    var hours =
        existingThisWeek?.estimatedHours ??
        existingNextWeek?.estimatedHours ??
        template.defaultHours;
    final isSuppliesRequest = controller.isSuppliesRequestTemplate(template);
    final suppliesDraft = controller.suppliesRequestDraftForTemplate(
      template.id,
    );
    final suppliesController = TextEditingController(text: suppliesDraft.notes);
    var suppliesNeededByIso = suppliesDraft.neededByIso;

    await showModalBottomSheet<void>(
      context: pageContext,
      isScrollControlled: true,
      builder: (context) {
        return StatefulBuilder(
          builder: (context, setModalState) {
            return Padding(
              padding: EdgeInsets.only(
                left: 16,
                right: 16,
                top: 16,
                bottom: MediaQuery.of(context).viewInsets.bottom + 16,
              ),
              child: SingleChildScrollView(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      template.title,
                      style: Theme.of(context).textTheme.titleMedium,
                    ),
                    const SizedBox(height: 8),
                    SwitchListTile(
                      contentPadding: EdgeInsets.zero,
                      title: const Text('Schedule for next week'),
                      value: forNextWeek,
                      onChanged: (value) {
                        setModalState(() {
                          forNextWeek = value;
                        });
                      },
                    ),
                    if (!forNextWeek)
                      DropdownButtonFormField<int>(
                        initialValue: selectedDay,
                        items: List.generate(
                          5,
                          (index) => DropdownMenuItem<int>(
                            value: index,
                            child: Text(AppController.dayLabels[index]),
                          ),
                        ),
                        onChanged: (value) {
                          if (value == null) {
                            return;
                          }
                          setModalState(() {
                            selectedDay = value;
                          });
                        },
                        decoration: const InputDecoration(
                          labelText: 'Preferred day',
                        ),
                      ),
                    const SizedBox(height: 12),
                    DropdownButtonFormField<double>(
                      initialValue: hours,
                      isExpanded: true,
                      items: AppController.hourStepOptions()
                          .map(
                            (value) => DropdownMenuItem<double>(
                              value: value,
                              child: Text(
                                AppController.formatHoursLabel(value),
                              ),
                            ),
                          )
                          .toList(),
                      onChanged: (value) {
                        if (value == null) {
                          return;
                        }
                        setModalState(() {
                          hours = value;
                        });
                      },
                      decoration: const InputDecoration(
                        labelText: 'Estimated time',
                      ),
                    ),
                    if (isSuppliesRequest) ...[
                      const SizedBox(height: 12),
                      TextFormField(
                        controller: suppliesController,
                        maxLines: 4,
                        decoration: const InputDecoration(
                          labelText: 'Supplies list',
                          hintText:
                              'Enter items and quantities (for example: 10 staples, 2 pieces of paper).',
                        ),
                      ),
                      const SizedBox(height: 8),
                      OutlinedButton.icon(
                        onPressed: () async {
                          final now = DateTime.now();
                          final initialDate =
                              DateTime.tryParse(suppliesNeededByIso) ?? now;
                          final picked = await showDatePicker(
                            context: context,
                            firstDate: DateTime(now.year - 1),
                            lastDate: DateTime(now.year + 5),
                            initialDate: initialDate,
                          );
                          if (picked == null) {
                            return;
                          }
                          final month = picked.month.toString().padLeft(2, '0');
                          final day = picked.day.toString().padLeft(2, '0');
                          setModalState(() {
                            suppliesNeededByIso =
                                '${picked.year}-$month-$day';
                          });
                        },
                        icon: const Icon(Icons.calendar_month),
                        label: Text(
                          suppliesNeededByIso.trim().isEmpty
                              ? 'When do they need the supplies by?'
                              : 'Needed by: $suppliesNeededByIso',
                        ),
                      ),
                    ],
                    const SizedBox(height: 8),
                    Row(
                      children: [
                        if (existingThisWeek != null ||
                            existingNextWeek != null)
                          TextButton(
                            onPressed: () {
                              controller.removePlan(
                                template.id,
                                fromNextWeek: forNextWeek,
                              );
                              Navigator.of(context).pop();
                            },
                            child: const Text('Remove'),
                          ),
                        const Spacer(),
                        ElevatedButton(
                          onPressed: () {
                            if (isSuppliesRequest) {
                              controller.saveSuppliesRequestDraftForTemplate(
                                template.id,
                                notes: suppliesController.text.trim(),
                                neededByIso: suppliesNeededByIso.trim(),
                              );
                            }
                            final result = controller.planAssessment(
                              template: template,
                              hours: hours,
                              preferredDay: selectedDay,
                              forNextWeek: forNextWeek,
                            );
                            Navigator.of(context).pop();
                            if (!pageContext.mounted) {
                              return;
                            }
                            if (!forNextWeek &&
                                result.movedToDifferentDay &&
                                result.assignedDay != null) {
                              showDialog<void>(
                                context: pageContext,
                                builder: (context) {
                                  return AlertDialog(
                                    title: const Text('Task moved'),
                                    content: Text(
                                      "There's not enough allotted time for this task. "
                                      'This task will be moved to ${AppController.dayLabels[result.assignedDay!]}.',
                                    ),
                                    actions: [
                                      TextButton(
                                        onPressed: () {
                                          Navigator.of(context).pop();
                                        },
                                        child: const Text('OK'),
                                      ),
                                    ],
                                  );
                                },
                              );
                            }
                          },
                          child: const Text('Save Plan'),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            );
          },
        );
      },
    );
    suppliesController.dispose();
  }
}

class CalendarOverviewPage extends StatefulWidget {
  const CalendarOverviewPage({super.key, required this.controller});

  final AppController controller;

  @override
  State<CalendarOverviewPage> createState() => _CalendarOverviewPageState();
}

class _CalendarOverviewPageState extends State<CalendarOverviewPage> {
  late DateTime _visibleMonth;

  @override
  void initState() {
    super.initState();
    final now = DateTime.now();
    _visibleMonth = DateTime(now.year, now.month, 1);
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: widget.controller,
      builder: (context, _) {
        final controller = widget.controller;
        final allTasks = controller.allScheduledCalendarTasksForActiveTrack;
        final monthTasks = <int, List<WeekTask>>{};
        for (final task in allTasks) {
          final date = DateTime.tryParse(task.scheduledDateIso);
          if (date == null) {
            continue;
          }
          if (date.year == _visibleMonth.year &&
              date.month == _visibleMonth.month) {
            monthTasks.putIfAbsent(date.day, () => <WeekTask>[]).add(task);
          }
        }
        for (final tasks in monthTasks.values) {
          tasks.sort((a, b) => a.priority.compareTo(b.priority));
        }

        final daysInMonth = DateTime(
          _visibleMonth.year,
          _visibleMonth.month + 1,
          0,
        ).day;
        final leadingSlots =
            DateTime(_visibleMonth.year, _visibleMonth.month, 1).weekday - 1;
        final totalSlots = ((leadingSlots + daysInMonth) / 7).ceil() * 7;

        return ListView(
          padding: const EdgeInsets.all(16),
          children: [
            Card(
              child: Padding(
                padding: const EdgeInsets.all(12),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Calendar Overview',
                      style: Theme.of(context).textTheme.titleMedium,
                    ),
                    const SizedBox(height: 4),
                    Text(
                      '${controller.activeTrack.label} • ${controller.selectedRole.label}',
                      style: Theme.of(context).textTheme.bodySmall,
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 10),
            Card(
              child: Padding(
                padding: const EdgeInsets.all(10),
                child: Column(
                  children: [
                    Row(
                      children: [
                        IconButton(
                          onPressed: () {
                            setState(() {
                              _visibleMonth = DateTime(
                                _visibleMonth.year,
                                _visibleMonth.month - 1,
                                1,
                              );
                            });
                          },
                          icon: const Icon(Icons.chevron_left),
                        ),
                        Expanded(
                          child: Text(
                            _monthLabel(_visibleMonth),
                            textAlign: TextAlign.center,
                            style: Theme.of(context).textTheme.titleMedium,
                          ),
                        ),
                        IconButton(
                          onPressed: () {
                            setState(() {
                              _visibleMonth = DateTime(
                                _visibleMonth.year,
                                _visibleMonth.month + 1,
                                1,
                              );
                            });
                          },
                          icon: const Icon(Icons.chevron_right),
                        ),
                      ],
                    ),
                    const SizedBox(height: 6),
                    Row(
                      children: const [
                        Expanded(child: Center(child: Text('Mon'))),
                        Expanded(child: Center(child: Text('Tue'))),
                        Expanded(child: Center(child: Text('Wed'))),
                        Expanded(child: Center(child: Text('Thu'))),
                        Expanded(child: Center(child: Text('Fri'))),
                        Expanded(child: Center(child: Text('Sat'))),
                        Expanded(child: Center(child: Text('Sun'))),
                      ],
                    ),
                    const SizedBox(height: 6),
                    GridView.builder(
                      shrinkWrap: true,
                      physics: const NeverScrollableScrollPhysics(),
                      itemCount: totalSlots,
                      gridDelegate:
                          const SliverGridDelegateWithFixedCrossAxisCount(
                            crossAxisCount: 7,
                            childAspectRatio: 0.82,
                            crossAxisSpacing: 4,
                            mainAxisSpacing: 4,
                          ),
                      itemBuilder: (context, index) {
                        final dayNumber = index - leadingSlots + 1;
                        if (dayNumber < 1 || dayNumber > daysInMonth) {
                          return const SizedBox.shrink();
                        }
                        final tasks =
                            monthTasks[dayNumber] ?? const <WeekTask>[];
                        return GestureDetector(
                          onDoubleTap: () {
                            _showDayTasksDialog(
                              context,
                              dayNumber: dayNumber,
                              tasks: tasks,
                            );
                          },
                          child: Container(
                            decoration: BoxDecoration(
                              color: tasks.isEmpty
                                  ? const Color(0xFFFAFAFA)
                                  : const Color(0xFFE8F5E4),
                              borderRadius: BorderRadius.circular(8),
                              border: Border.all(
                                color: tasks.isEmpty
                                    ? const Color(0xFFE5E5E5)
                                    : const Color(0xFFB9DEB2),
                              ),
                            ),
                            padding: const EdgeInsets.all(6),
                            child: Row(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  '$dayNumber',
                                  style: const TextStyle(
                                    fontWeight: FontWeight.w600,
                                    fontSize: 12,
                                  ),
                                ),
                                const Spacer(),
                                if (tasks.isNotEmpty)
                                  Container(
                                    padding: const EdgeInsets.symmetric(
                                      horizontal: 4,
                                      vertical: 1,
                                    ),
                                    decoration: BoxDecoration(
                                      color: const Color(0xFFAED7A5),
                                      borderRadius: BorderRadius.circular(8),
                                    ),
                                    child: Text(
                                      '${tasks.length}',
                                      style: const TextStyle(
                                        fontSize: 9,
                                        fontWeight: FontWeight.w600,
                                      ),
                                    ),
                                  ),
                              ],
                            ),
                          ),
                        );
                      },
                    ),
                  ],
                ),
              ),
            ),
          ],
        );
      },
    );
  }

  Future<void> _showDayTasksDialog(
    BuildContext context, {
    required int dayNumber,
    required List<WeekTask> tasks,
  }) async {
    final date = DateTime(_visibleMonth.year, _visibleMonth.month, dayNumber);
    final dateLabel = '${date.month}/${date.day}/${date.year}';
    await showDialog<void>(
      context: context,
      builder: (context) {
        return AlertDialog(
          title: Text('Tasks for $dateLabel'),
          content: SizedBox(
            width: 560,
            child: tasks.isEmpty
                ? const Text('No tasks scheduled for this day.')
                : ListView.separated(
                    shrinkWrap: true,
                    itemCount: tasks.length,
                    separatorBuilder: (_, _) => const Divider(height: 12),
                    itemBuilder: (context, index) {
                      final task = tasks[index];
                      return ListTile(
                        contentPadding: EdgeInsets.zero,
                        title: Text(task.title),
                        subtitle: Text(
                          '${task.room} • P${task.priority} • ${task.estimatedHours.toStringAsFixed(1)}h',
                        ),
                      );
                    },
                  ),
          ),
          actions: [
            TextButton(
              onPressed: () {
                Navigator.of(context).pop();
              },
              child: const Text('Back'),
            ),
          ],
        );
      },
    );
  }

  String _monthLabel(DateTime value) {
    const monthNames = [
      'January',
      'February',
      'March',
      'April',
      'May',
      'June',
      'July',
      'August',
      'September',
      'October',
      'November',
      'December',
    ];
    return '${monthNames[value.month - 1]} ${value.year}';
  }
}

class WeeklyCalendarDialog extends StatelessWidget {
  const WeeklyCalendarDialog({
    super.key,
    required this.controller,
    required this.editable,
  });

  final AppController controller;
  final bool editable;

  Future<void> _handleCompletionToggle(
    BuildContext context,
    WeekTask task,
    bool newValue,
  ) async {
    if (!newValue) {
      controller.toggleThisWeekCompletion(task.id, false);
      return;
    }

    if (!task.sendCompletionMessage && !task.sendDataToSpecificEmployee) {
      controller.toggleThisWeekCompletion(task.id, true);
      return;
    }
    final initialRecipients = <UserRole>{};
    if (task.sendCompletionMessage &&
        task.completionNotifyRole != controller.selectedRole) {
      initialRecipients.add(task.completionNotifyRole);
    }
    if (task.sendDataToSpecificEmployee &&
        task.dataRecipientRole != controller.selectedRole) {
      initialRecipients.add(task.dataRecipientRole);
    }
    final lockedRecipient = task.sendDataToSpecificEmployee
        ? task.dataRecipientRole
        : null;

    final dispatch = await _showCompletionMessageDialog(
      context,
      controller,
      task,
      initialRecipients: initialRecipients,
      initialActionRequired: task.completionActionRequiredByDefault,
      recipientLockedRole: lockedRecipient,
      allowVoiceDictation: task.allowVoiceDictation,
      requireDataEntry: task.sendDataToSpecificEmployee,
    );
    if (dispatch == null) {
      return;
    }

    controller.completeTaskWithDispatch(task.id, dispatch);
  }

  Future<CompletionDispatch?> _showCompletionMessageDialog(
    BuildContext context,
    AppController controller,
    WeekTask task, {
    required Set<UserRole> initialRecipients,
    required bool initialActionRequired,
    required UserRole? recipientLockedRole,
    required bool allowVoiceDictation,
    required bool requireDataEntry,
  }) async {
    var selectedRecipients = recipientLockedRole == null
        ? <UserRole>{...initialRecipients}
        : <UserRole>{recipientLockedRole};
    var addRecipient = controller.recipientRoleOptions.firstOrNull;
    var actionRequired = initialActionRequired;
    var tagsInput = '';
    final notesController = TextEditingController(text: task.defaultDataEntryText);
    final attachments = <MessageAttachment>[];
    final picker = ImagePicker();
    final speech = stt.SpeechToText();
    var isListening = false;
    var speechReady = false;
    var dialogOpen = true;

    final result = await showDialog<CompletionDispatch>(
      context: context,
      builder: (context) {
        return StatefulBuilder(
          builder: (context, setDialogState) {
            void safeSetState(VoidCallback fn) {
              if (!dialogOpen || !context.mounted) {
                return;
              }
              setDialogState(fn);
            }
            if (recipientLockedRole != null) {
              selectedRecipients = {recipientLockedRole};
            }
            final availableToAdd = controller.recipientRoleOptions
                .where((role) => !selectedRecipients.contains(role))
                .toList();
            if (recipientLockedRole == null &&
                availableToAdd.isNotEmpty &&
                (addRecipient == null ||
                    !availableToAdd.contains(addRecipient))) {
              addRecipient = availableToAdd.first;
            }
            final hasData =
                notesController.text.trim().isNotEmpty ||
                _parseTags(tagsInput).isNotEmpty;
            final canSend = selectedRecipients.isNotEmpty &&
                (!requireDataEntry || hasData);

            Future<void> toggleListening() async {
              if (!speechReady) {
                speechReady = await speech.initialize(
                  onStatus: (status) {
                    if (status == 'done' || status == 'notListening') {
                      safeSetState(() {
                        isListening = false;
                      });
                    }
                  },
                  onError: (_) {
                    safeSetState(() {
                      isListening = false;
                    });
                  },
                );
              }
              if (!speechReady) {
                return;
              }
              if (isListening) {
                await speech.stop();
                safeSetState(() {
                  isListening = false;
                });
                return;
              }
              safeSetState(() {
                isListening = true;
              });
              await speech.listen(
                listenOptions: stt.SpeechListenOptions(
                  listenMode: stt.ListenMode.dictation,
                  partialResults: true,
                ),
                onResult: (result) {
                  safeSetState(() {
                    notesController.text = result.recognizedWords;
                    notesController.selection = TextSelection.collapsed(
                      offset: notesController.text.length,
                    );
                  });
                },
              );
            }

            return AlertDialog(
              title: const Text('Send Completion Message'),
              content: SizedBox(
                width: 520,
                child: SingleChildScrollView(
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        task.title,
                        style: Theme.of(context).textTheme.titleSmall,
                      ),
                      const SizedBox(height: 8),
                      const Text(
                        'Team Members',
                        style: TextStyle(fontWeight: FontWeight.w600),
                      ),
                      const SizedBox(height: 6),
                      if (selectedRecipients.isEmpty)
                        const Text('No recipients selected.')
                      else
                        Wrap(
                          spacing: 6,
                          runSpacing: 6,
                          children: selectedRecipients
                              .map(
                                (role) => InputChip(
                                  label: Text(role.label),
                                  onDeleted: recipientLockedRole == null
                                      ? () {
                                          safeSetState(() {
                                            selectedRecipients.remove(role);
                                          });
                                        }
                                      : null,
                                ),
                              )
                              .toList(),
                        ),
                      const SizedBox(height: 8),
                      if (recipientLockedRole != null)
                        Text(
                          'Locked team member: ${recipientLockedRole.label}',
                          style: Theme.of(context).textTheme.bodySmall,
                        )
                      else if (availableToAdd.isNotEmpty)
                        Row(
                          children: [
                            Expanded(
                              child: DropdownButtonFormField<UserRole>(
                                initialValue: addRecipient,
                                isExpanded: true,
                                items: availableToAdd
                                    .map(
                                      (role) => DropdownMenuItem<UserRole>(
                                        value: role,
                                        child: Text(role.label),
                                      ),
                                    )
                                    .toList(),
                                onChanged: (value) {
                                  if (value == null) {
                                    return;
                                  }
                                  safeSetState(() {
                                    addRecipient = value;
                                  });
                                },
                                decoration: const InputDecoration(
                                  labelText: 'Add team member role',
                                ),
                              ),
                            ),
                            const SizedBox(width: 8),
                            FilledButton(
                              onPressed: addRecipient == null
                                  ? null
                                  : () {
                                      safeSetState(() {
                                        selectedRecipients.add(addRecipient!);
                                      });
                                    },
                              child: const Text('Add'),
                            ),
                          ],
                        ),
                      const SizedBox(height: 10),
                      TextFormField(
                        decoration: const InputDecoration(
                          labelText: 'Tag numbers / numeric info',
                          hintText: 'e.g. 1A406..., 1A407...',
                        ),
                        onChanged: (value) {
                          tagsInput = value;
                          safeSetState(() {});
                        },
                      ),
                      const SizedBox(height: 8),
                      TextFormField(
                        controller: notesController,
                        maxLines: 4,
                        decoration: InputDecoration(
                          labelText: requireDataEntry
                              ? 'Data details (required for team member message)'
                              : 'Notes / message',
                          hintText: allowVoiceDictation
                              ? 'Type notes or tap voice dictation.'
                              : 'Type notes details.',
                        ),
                        onChanged: (_) {
                          safeSetState(() {});
                        },
                      ),
                      if (allowVoiceDictation) ...[
                        const SizedBox(height: 8),
                        OutlinedButton.icon(
                          onPressed: toggleListening,
                          icon: Icon(
                            isListening ? Icons.mic_off_outlined : Icons.mic,
                          ),
                          label: Text(
                            isListening
                                ? 'Stop voice dictation'
                                : 'Start voice dictation',
                          ),
                        ),
                      ],
                      const SizedBox(height: 8),
                      Row(
                        children: [
                          OutlinedButton.icon(
                            onPressed: () async {
                              final image = await picker.pickImage(
                                source: ImageSource.camera,
                                imageQuality: 70,
                                maxWidth: 1280,
                              );
                              if (image == null || !context.mounted) {
                                return;
                              }
                              final bytes = await image.readAsBytes();
                              safeSetState(() {
                                attachments.add(
                                  MessageAttachment(
                                    name: image.name,
                                    bytes: bytes,
                                  ),
                                );
                              });
                            },
                            icon: const Icon(Icons.photo_camera_outlined),
                            label: const Text('Take photo'),
                          ),
                          const SizedBox(width: 8),
                          OutlinedButton.icon(
                            onPressed: () async {
                              final image = await picker.pickImage(
                                source: ImageSource.gallery,
                                imageQuality: 70,
                                maxWidth: 1280,
                              );
                              if (image == null || !context.mounted) {
                                return;
                              }
                              final bytes = await image.readAsBytes();
                              safeSetState(() {
                                attachments.add(
                                  MessageAttachment(
                                    name: image.name,
                                    bytes: bytes,
                                  ),
                                );
                              });
                            },
                            icon: const Icon(Icons.photo_library_outlined),
                            label: const Text('Upload photo'),
                          ),
                        ],
                      ),
                      if (attachments.isNotEmpty) ...[
                        const SizedBox(height: 8),
                        Wrap(
                          spacing: 8,
                          runSpacing: 8,
                          children: List.generate(attachments.length, (index) {
                            final attachment = attachments[index];
                            return Stack(
                              clipBehavior: Clip.none,
                              children: [
                                ClipRRect(
                                  borderRadius: BorderRadius.circular(8),
                                  child: Image.memory(
                                    attachment.bytes,
                                    width: 72,
                                    height: 72,
                                    fit: BoxFit.cover,
                                  ),
                                ),
                                Positioned(
                                  right: -8,
                                  top: -8,
                                  child: IconButton(
                                    iconSize: 18,
                                    padding: EdgeInsets.zero,
                                    onPressed: () {
                                      safeSetState(() {
                                        attachments.removeAt(index);
                                      });
                                    },
                                    icon: const Icon(Icons.cancel),
                                  ),
                                ),
                              ],
                            );
                          }),
                        ),
                      ],
                      const SizedBox(height: 8),
                      SwitchListTile(
                        contentPadding: EdgeInsets.zero,
                        title: const Text(
                          'Action required: auto-schedule on receiver calendar',
                        ),
                        value: actionRequired,
                        onChanged: (value) {
                          safeSetState(() {
                            actionRequired = value;
                          });
                        },
                      ),
                    ],
                  ),
                ),
              ),
              actions: [
                TextButton(
                  onPressed: () {
                    dialogOpen = false;
                    speech.stop();
                    Navigator.of(context).pop();
                  },
                  child: const Text('Back'),
                ),
                FilledButton(
                  onPressed: !canSend
                      ? null
                      : () {
                          dialogOpen = false;
                          speech.stop();
                          Navigator.of(context).pop(
                            CompletionDispatch(
                              recipients: selectedRecipients.toList(),
                              notes: notesController.text.trim(),
                              tags: _parseTags(tagsInput),
                              attachments: attachments,
                              actionRequired: actionRequired,
                            ),
                          );
                        },
                  child: const Text('Send & Complete'),
                ),
              ],
            );
          },
        );
      },
    );
    dialogOpen = false;
    return result;
  }

  List<String> _parseTags(String input) {
    return input
        .split(RegExp(r'[,\n;]+'))
        .map((item) => item.trim())
        .where((item) => item.isNotEmpty)
        .toList();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: controller,
      builder: (context, _) {
        return AlertDialog(
          insetPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 20),
          title: const Text('This Week Calendar'),
          content: SizedBox(
            width: MediaQuery.of(context).size.width * 0.94,
            height: MediaQuery.of(context).size.height * 0.78,
            child: SingleChildScrollView(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  ...List.generate(5, (index) {
                    final tasks = controller.tasksForDay(index);
                    return Card(
                      margin: const EdgeInsets.only(bottom: 8),
                      child: Padding(
                        padding: const EdgeInsets.all(10),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              '${AppController.dayLabels[index]} (${controller.dayLoad(index).toStringAsFixed(1)}h)',
                              style: Theme.of(context).textTheme.titleSmall,
                            ),
                            const SizedBox(height: 6),
                            if (tasks.isEmpty)
                              const Text('No assessments')
                            else
                              ...tasks.map(
                                (task) => CheckboxListTile(
                                  contentPadding: EdgeInsets.zero,
                                  dense: true,
                                  value: task.completed,
                                  onChanged: editable
                                      ? (value) async {
                                          await _handleCompletionToggle(
                                            context,
                                            task,
                                            value ?? false,
                                          );
                                        }
                                      : null,
                                  title: Text(task.title),
                                  subtitle: Text(
                                    '${task.room} • P${task.priority} • ${task.estimatedHours.toStringAsFixed(1)}h',
                                  ),
                                ),
                              ),
                          ],
                        ),
                      ),
                    );
                  }),
                  if (controller.overflowTasks.isNotEmpty)
                    Padding(
                      padding: const EdgeInsets.only(top: 8),
                      child: Text(
                        'Overflow into next week: ${controller.overflowTasks.length} assessments',
                      ),
                    ),
                ],
              ),
            ),
          ),
          actions: [
            TextButton(
              onPressed: () {
                Navigator.of(context).pop();
              },
              child: const Text('Close'),
            ),
          ],
        );
      },
    );
  }
}

class InboxDialog extends StatelessWidget {
  const InboxDialog({super.key, required this.controller});

  final AppController controller;

  Future<void> _showComposeMessageDialog(BuildContext context) async {
    var selectedRecipients = <UserRole>{};
    var addRecipient = controller.recipientRoleOptions.firstOrNull;
    final titleController = TextEditingController();
    final notesController = TextEditingController();
    var tagsInput = '';

    final dispatch = await showDialog<CompletionDispatch>(
      context: context,
      builder: (context) {
        return StatefulBuilder(
          builder: (context, setDialogState) {
            final availableToAdd = controller.recipientRoleOptions
                .where((role) => !selectedRecipients.contains(role))
                .toList();
            if (availableToAdd.isNotEmpty &&
                (addRecipient == null ||
                    !availableToAdd.contains(addRecipient))) {
              addRecipient = availableToAdd.first;
            }
            final hasTitle = titleController.text.trim().isNotEmpty;
            final canSend = selectedRecipients.isNotEmpty && hasTitle;

            return AlertDialog(
              title: const Text('Compose Message'),
              content: SizedBox(
                width: 520,
                child: SingleChildScrollView(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const Text(
                        'Team Members',
                        style: TextStyle(fontWeight: FontWeight.w600),
                      ),
                      const SizedBox(height: 6),
                      if (selectedRecipients.isEmpty)
                        const Text('No recipients selected.')
                      else
                        Wrap(
                          spacing: 6,
                          runSpacing: 6,
                          children: selectedRecipients
                              .map(
                                (role) => InputChip(
                                  label: Text(role.label),
                                  onDeleted: () {
                                    setDialogState(() {
                                      selectedRecipients.remove(role);
                                    });
                                  },
                                ),
                              )
                              .toList(),
                        ),
                      const SizedBox(height: 8),
                      if (availableToAdd.isNotEmpty)
                        Row(
                          children: [
                            Expanded(
                              child: DropdownButtonFormField<UserRole>(
                                initialValue: addRecipient,
                                isExpanded: true,
                                items: availableToAdd
                                    .map(
                                      (role) => DropdownMenuItem<UserRole>(
                                        value: role,
                                        child: Text(role.label),
                                      ),
                                    )
                                    .toList(),
                                onChanged: (value) {
                                  if (value == null) {
                                    return;
                                  }
                                  setDialogState(() {
                                    addRecipient = value;
                                  });
                                },
                                decoration: const InputDecoration(
                                  labelText: 'Add team member role',
                                ),
                              ),
                            ),
                            const SizedBox(width: 8),
                            FilledButton(
                              onPressed: addRecipient == null
                                  ? null
                                  : () {
                                      setDialogState(() {
                                        selectedRecipients.add(addRecipient!);
                                      });
                                    },
                              child: const Text('Add'),
                            ),
                          ],
                        ),
                      const SizedBox(height: 10),
                      TextFormField(
                        controller: titleController,
                        decoration: const InputDecoration(
                          labelText: 'Subject',
                        ),
                        onChanged: (_) {
                          setDialogState(() {});
                        },
                      ),
                      const SizedBox(height: 8),
                      TextFormField(
                        decoration: const InputDecoration(
                          labelText: 'Tag numbers / numeric info',
                          hintText: 'e.g. 1A406..., 1A407...',
                        ),
                        onChanged: (value) {
                          tagsInput = value;
                        },
                      ),
                      const SizedBox(height: 8),
                      TextFormField(
                        controller: notesController,
                        maxLines: 4,
                        decoration: const InputDecoration(
                          labelText: 'Message',
                        ),
                      ),
                    ],
                  ),
                ),
              ),
              actions: [
                TextButton(
                  onPressed: () {
                    Navigator.of(context).pop();
                  },
                  child: const Text('Cancel'),
                ),
                FilledButton(
                  onPressed: !canSend
                      ? null
                      : () {
                          Navigator.of(context).pop(
                            CompletionDispatch(
                              recipients: selectedRecipients.toList(),
                              notes: notesController.text.trim(),
                              tags: _parseTags(tagsInput),
                              attachments: const <MessageAttachment>[],
                              actionRequired: false,
                              titleOverride: titleController.text.trim(),
                            ),
                          );
                        },
                  child: const Text('Send'),
                ),
              ],
            );
          },
        );
      },
    );

    titleController.dispose();
    notesController.dispose();

    if (dispatch == null) {
      return;
    }

    controller.sendInboxMessage(
      recipients: dispatch.recipients,
      title: dispatch.titleOverride.trim(),
      notes: dispatch.notes,
      tags: dispatch.tags,
      attachments: dispatch.attachments,
      actionRequired: dispatch.actionRequired,
    );
  }

  List<String> _parseTags(String input) {
    return input
        .split(RegExp(r'[,\n;]+'))
        .map((item) => item.trim())
        .where((item) => item.isNotEmpty)
        .toList();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: controller,
      builder: (context, _) {
        final messages = controller.inboxForSelectedRole;
        return AlertDialog(
          title: Text('${controller.selectedRole.label} Inbox'),
          content: SizedBox(
            width: 560,
            child: messages.isEmpty
                ? const Text('No messages.')
                : ListView.separated(
                    shrinkWrap: true,
                    itemCount: messages.length,
                    separatorBuilder: (_, _) => const Divider(height: 16),
                    itemBuilder: (context, index) {
                      final message = messages[index];
                      return ListTile(
                        contentPadding: EdgeInsets.zero,
                        onTap: () {
                          controller.markInboxMessageRead(message.id);
                        },
                        leading: Icon(
                          message.isRead
                              ? Icons.mark_email_read_outlined
                              : Icons.mark_email_unread_outlined,
                        ),
                        title: Text(message.title),
                        subtitle: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              'From ${message.fromRole.label} • ${controller.formatTimestamp(message.createdAt)}',
                            ),
                            if (message.notes.isNotEmpty) Text(message.notes),
                            if (message.tags.isNotEmpty)
                              Padding(
                                padding: const EdgeInsets.only(top: 4),
                                child: Wrap(
                                  spacing: 6,
                                  runSpacing: 6,
                                  children: message.tags
                                      .map((tag) => Chip(label: Text(tag)))
                                      .toList(),
                                ),
                              ),
                            if (message.attachments.isNotEmpty)
                              Padding(
                                padding: const EdgeInsets.only(top: 4),
                                child: Wrap(
                                  spacing: 8,
                                  runSpacing: 8,
                                  children: message.attachments
                                      .map(
                                        (attachment) => ClipRRect(
                                          borderRadius: BorderRadius.circular(
                                            8,
                                          ),
                                          child: Image.memory(
                                            attachment.bytes,
                                            width: 64,
                                            height: 64,
                                            fit: BoxFit.cover,
                                          ),
                                        ),
                                      )
                                      .toList(),
                                ),
                              ),
                            if (message.actionRequired)
                              const Padding(
                                padding: EdgeInsets.only(top: 4),
                                child: Text(
                                  'Action required and scheduled on calendar.',
                                ),
                              ),
                          ],
                        ),
                        isThreeLine: true,
                      );
                    },
                  ),
          ),
          actions: [
            FilledButton.icon(
              onPressed: () async {
                await _showComposeMessageDialog(context);
              },
              icon: const Icon(Icons.edit_outlined),
              label: const Text('Compose'),
            ),
            TextButton(
              onPressed: () {
                controller.markAllInboxMessagesReadForSelectedRole();
              },
              child: const Text('Mark all read'),
            ),
            TextButton(
              onPressed: () {
                Navigator.of(context).pop();
              },
              child: const Text('Close'),
            ),
          ],
        );
      },
    );
  }
}

class AdminAssessmentsPage extends StatelessWidget {
  const AdminAssessmentsPage({super.key, required this.controller});

  final AppController controller;

  @override
  Widget build(BuildContext context) {
    if (!controller.selectedRole.canAdmin) {
      return const Center(
        child: Text('Only CEO can access admin assessment controls.'),
      );
    }

    final templatesByRoom = controller.templatesByRoomForActiveTrack();

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Card(
          child: Padding(
            padding: const EdgeInsets.all(12),
            child: Row(
              children: [
                Expanded(
                  child: Text(
                    'CEO Admin • ${controller.activeTrack.label}',
                    style: Theme.of(context).textTheme.titleMedium,
                  ),
                ),
                FilledButton.icon(
                  onPressed: () async {
                    await _openEditor(context, controller);
                  },
                  icon: const Icon(Icons.add),
                  label: const Text('New Assessment'),
                ),
              ],
            ),
          ),
        ),
        const SizedBox(height: 10),
        ...templatesByRoom.entries.map(
          (entry) => Card(
            margin: const EdgeInsets.only(bottom: 10),
            child: ExpansionTile(
              title: Text(entry.key),
              subtitle: Text('${entry.value.length} Tasks'),
              children: entry.value
                  .map(
                    (template) => ListTile(
                      title: Text(template.title),
                      subtitle: Text(
                        '${controller.displayCategoryName(template.category)} • Priority ${template.priority} • ${template.defaultHours.toStringAsFixed(1)}h',
                      ),
                      trailing: IconButton(
                        tooltip: 'Edit',
                        onPressed: () async {
                          await _openEditor(
                            context,
                            controller,
                            existing: template,
                          );
                        },
                        icon: const Icon(Icons.edit_outlined),
                      ),
                    ),
                  )
                  .toList(),
            ),
          ),
        ),
      ],
    );
  }

  Future<void> _openEditor(
    BuildContext context,
    AppController controller, {
    AssessmentTemplate? existing,
  }) async {
    var titleValue = existing?.title ?? '';
    var selectedRoom = existing?.room ?? '';
    var selectedCategory = existing?.category ?? '';

    var priority = existing?.priority ?? 3;
    var hours = existing?.defaultHours ?? 1.0;
    var track = existing?.track ?? controller.activeTrack;

    var autoFollowUp = existing?.autoFollowUp ?? false;
    final followUpDrafts = _initialFollowUpDrafts(existing);
    final completionActionRequiredByDefault = _readTemplateBool(
      existing,
      (template) => template.completionActionRequiredByDefault,
      true,
    );

    final result = await showDialog<bool>(
      context: context,
      builder: (context) {
        return StatefulBuilder(
          builder: (context, setDialogState) {
            const addTitleOption = '__add_title__';
            const addRoomOption = '__add_room__';
            const addCategoryOption = '__add_category__';

            final titleOptions = controller.titlesForTrack(
              track,
              include: titleValue,
            );
            final roomOptions = controller.roomsForTrack(
              track,
              include: selectedRoom,
            );
            final categoryOptions = controller.categoriesForTrack(
              track,
              include: selectedCategory,
            );
            if (!roomOptions.contains(selectedRoom)) {
              selectedRoom = roomOptions.first;
            }
            if (!categoryOptions.contains(selectedCategory)) {
              selectedCategory = categoryOptions.first;
            }
            if (!titleOptions.contains(titleValue)) {
              titleValue = titleOptions.first;
            }

            return AlertDialog(
              title: Text(
                existing == null ? 'New Assessment' : 'Edit Assessment',
              ),
              content: SizedBox(
                width: 520,
                child: SingleChildScrollView(
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      if (existing == null)
                        DropdownButtonFormField<AssessmentTrack>(
                          initialValue: track,
                          isExpanded: true,
                          items: AssessmentTrack.values
                              .map(
                                (value) => DropdownMenuItem<AssessmentTrack>(
                                  value: value,
                                  child: Text(value.label),
                                ),
                              )
                              .toList(),
                          onChanged: (value) {
                            if (value == null) {
                              return;
                            }
                            setDialogState(() {
                              track = value;
                              final nextTitleOptions = controller
                                  .titlesForTrack(track, include: titleValue);
                              final nextRoomOptions = controller.roomsForTrack(
                                track,
                                include: selectedRoom,
                              );
                              final nextCategoryOptions = controller
                                  .categoriesForTrack(
                                    track,
                                    include: selectedCategory,
                                  );
                              if (!nextRoomOptions.contains(selectedRoom)) {
                                selectedRoom = nextRoomOptions.first;
                              }
                              if (!nextCategoryOptions.contains(
                                selectedCategory,
                              )) {
                                selectedCategory = nextCategoryOptions.first;
                              }
                              if (!nextTitleOptions.contains(titleValue)) {
                                titleValue = nextTitleOptions.first;
                              }
                            });
                          },
                          decoration: const InputDecoration(
                            labelText: 'Role Track',
                          ),
                        ),
                      DropdownButtonFormField<String>(
                        initialValue: titleValue,
                        isExpanded: true,
                        items: [
                          const DropdownMenuItem<String>(
                            value: addTitleOption,
                            child: Text('+ Add new title...'),
                          ),
                          ...titleOptions.map(
                            (title) => DropdownMenuItem<String>(
                              value: title,
                              child: Text(
                                title,
                                overflow: TextOverflow.ellipsis,
                                maxLines: 1,
                              ),
                            ),
                          ),
                        ],
                        onChanged: (value) async {
                          if (value == null) {
                            return;
                          }
                          if (value == addTitleOption) {
                            final created = await _promptForNewDropdownValue(
                              context,
                              fieldLabel: 'Title',
                            );
                            if (created == null) {
                              return;
                            }
                            setDialogState(() {
                              titleValue = created;
                            });
                            return;
                          }
                          setDialogState(() {
                            titleValue = value;
                          });
                        },
                        decoration: const InputDecoration(labelText: 'Title'),
                      ),
                      DropdownButtonFormField<String>(
                        initialValue: selectedRoom,
                        isExpanded: true,
                        items: [
                          const DropdownMenuItem<String>(
                            value: addRoomOption,
                            child: Text('+ Add new room...'),
                          ),
                          ...roomOptions.map(
                            (room) => DropdownMenuItem<String>(
                              value: room,
                              child: Text(
                                room,
                                overflow: TextOverflow.ellipsis,
                                maxLines: 1,
                              ),
                            ),
                          ),
                        ],
                        onChanged: (value) async {
                          if (value == null) {
                            return;
                          }
                          if (value == addRoomOption) {
                            final created = await _promptForNewDropdownValue(
                              context,
                              fieldLabel: 'Room',
                            );
                            if (created == null) {
                              return;
                            }
                            setDialogState(() {
                              selectedRoom = created;
                            });
                            return;
                          }
                          setDialogState(() {
                            selectedRoom = value;
                          });
                        },
                        decoration: const InputDecoration(labelText: 'Room'),
                      ),
                      DropdownButtonFormField<String>(
                        initialValue: selectedCategory,
                        isExpanded: true,
                        items: [
                          const DropdownMenuItem<String>(
                            value: addCategoryOption,
                            child: Text('+ Add new category...'),
                          ),
                          ...categoryOptions.map(
                            (category) => DropdownMenuItem<String>(
                              value: category,
                              child: Text(
                                category,
                                overflow: TextOverflow.ellipsis,
                                maxLines: 1,
                              ),
                            ),
                          ),
                        ],
                        onChanged: (value) async {
                          if (value == null) {
                            return;
                          }
                          if (value == addCategoryOption) {
                            final created = await _promptForNewDropdownValue(
                              context,
                              fieldLabel: 'Category',
                            );
                            if (created == null) {
                              return;
                            }
                            setDialogState(() {
                              selectedCategory = created;
                            });
                            return;
                          }
                          setDialogState(() {
                            selectedCategory = value;
                          });
                        },
                        decoration: const InputDecoration(
                          labelText: 'Category',
                        ),
                      ),
                      const SizedBox(height: 10),
                      DropdownButtonFormField<int>(
                        initialValue: priority,
                        items: List.generate(
                          5,
                          (index) => DropdownMenuItem<int>(
                            value: index + 1,
                            child: Text('${index + 1}'),
                          ),
                        ),
                        onChanged: (value) {
                          if (value == null) {
                            return;
                          }
                          setDialogState(() {
                            priority = value;
                          });
                        },
                        decoration: const InputDecoration(
                          labelText: 'Priority (1 highest)',
                        ),
                      ),
                      DropdownButtonFormField<double>(
                        initialValue: hours,
                        isExpanded: true,
                        items: AppController.hourStepOptions()
                            .map(
                              (value) => DropdownMenuItem<double>(
                                value: value,
                                child: Text(
                                  AppController.formatHoursLabel(value),
                                ),
                              ),
                            )
                            .toList(),
                        onChanged: (value) {
                          if (value == null) {
                            return;
                          }
                          setDialogState(() {
                            hours = value;
                          });
                        },
                        decoration: const InputDecoration(
                          labelText: 'Default time allocation',
                        ),
                      ),
                      const SizedBox(height: 4),
                      SwitchListTile(
                        contentPadding: EdgeInsets.zero,
                        title: const Text(
                          'Auto-create follow-up on completion',
                        ),
                        value: autoFollowUp,
                        onChanged: (value) {
                          setDialogState(() {
                            autoFollowUp = value;
                          });
                        },
                      ),
                      if (autoFollowUp) ...[
                        ...List.generate(followUpDrafts.length, (index) {
                          final draft = followUpDrafts[index];
                          final assignedTrack = draft.assignedRole.defaultTrack;
                          final dateOptions = _dateOptionsForFollowUp(
                            controller,
                            assignedTrack,
                            draft.weekOffset,
                          );
                          if (draft.calendarDateIso.isEmpty) {
                            final autoDate = DateTime.now().add(
                              Duration(days: draft.daysOffset.clamp(0, 70)),
                            );
                            draft.calendarDateIso = _isoDate(autoDate);
                            draft.day = _dayIndexFromIso(draft.calendarDateIso);
                          }
                          final selectedDateExists = dateOptions.any(
                            (option) => option.iso == draft.calendarDateIso,
                          );
                          final selectedDate = DateTime.tryParse(
                            draft.calendarDateIso,
                          );
                          final mergedDateOptions = [
                            if (!selectedDateExists)
                              _DateOption(
                                iso: draft.calendarDateIso,
                                label: selectedDate == null
                                    ? 'Selected date'
                                    : 'Auto • ${selectedDate.month}/${selectedDate.day}/${selectedDate.year}',
                              ),
                            ...dateOptions,
                          ];
                          return Card(
                            margin: const EdgeInsets.only(bottom: 8),
                            child: Padding(
                              padding: const EdgeInsets.all(8),
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Row(
                                    children: [
                                      Text('Follow-up ${index + 1}'),
                                      const Spacer(),
                                      IconButton(
                                        tooltip: 'Remove follow-up',
                                        onPressed: () {
                                          setDialogState(() {
                                            followUpDrafts.removeAt(index);
                                          });
                                        },
                                        icon: const Icon(Icons.delete_outline),
                                      ),
                                    ],
                                  ),
                                  TextFormField(
                                    initialValue: draft.title,
                                    onChanged: (value) {
                                      draft.title = value;
                                    },
                                    decoration: const InputDecoration(
                                      labelText: 'Follow-up title',
                                    ),
                                  ),
                                  const SizedBox(height: 8),
                                  DropdownButtonFormField<int>(
                                    initialValue: draft.priority,
                                    items: List.generate(
                                      5,
                                      (valueIndex) => DropdownMenuItem<int>(
                                        value: valueIndex + 1,
                                        child: Text('${valueIndex + 1}'),
                                      ),
                                    ),
                                    onChanged: (value) {
                                      if (value == null) {
                                        return;
                                      }
                                      setDialogState(() {
                                        draft.priority = value;
                                      });
                                    },
                                    decoration: const InputDecoration(
                                      labelText:
                                          'Follow-up priority (1 highest)',
                                    ),
                                  ),
                                  const SizedBox(height: 8),
                                  DropdownButtonFormField<double>(
                                    initialValue: draft.hours,
                                    isExpanded: true,
                                    items: AppController.hourStepOptions()
                                        .map(
                                          (value) => DropdownMenuItem<double>(
                                            value: value,
                                            child: Text(
                                              AppController.formatHoursLabel(
                                                value,
                                              ),
                                            ),
                                          ),
                                        )
                                        .toList(),
                                    onChanged: (value) {
                                      if (value == null) {
                                        return;
                                      }
                                      setDialogState(() {
                                        draft.hours = value;
                                      });
                                    },
                                    decoration: const InputDecoration(
                                      labelText: 'Follow-up time allocation',
                                    ),
                                  ),
                                  const SizedBox(height: 8),
                                  DropdownButtonFormField<UserRole>(
                                    initialValue: draft.assignedRole,
                                    isExpanded: true,
                                    items:
                                        const [
                                              UserRole.producer,
                                              UserRole.generalManager,
                                              UserRole.ceo,
                                            ]
                                            .map(
                                              (role) =>
                                                  DropdownMenuItem<UserRole>(
                                                    value: role,
                                                    child: Text(role.label),
                                                  ),
                                            )
                                            .toList(),
                                    onChanged: (value) {
                                      if (value == null) {
                                        return;
                                      }
                                      setDialogState(() {
                                        draft.assignedRole = value;
                                        final parsedDate = DateTime.tryParse(
                                          draft.calendarDateIso,
                                        );
                                        final effectiveDate =
                                            parsedDate ??
                                            DateTime.now().add(
                                              Duration(
                                                days: draft.daysOffset.clamp(
                                                  0,
                                                  70,
                                                ),
                                              ),
                                            );
                                        final roleWeekStart = controller
                                            .weekStartForTrack(
                                              value.defaultTrack,
                                            );
                                        final nextRoleWeekStart = roleWeekStart
                                            .add(const Duration(days: 7));
                                        draft.weekOffset =
                                            effectiveDate.isBefore(
                                              nextRoleWeekStart,
                                            )
                                            ? 0
                                            : 1;
                                      });
                                    },
                                    decoration: const InputDecoration(
                                      labelText: 'Assigned role',
                                    ),
                                  ),
                                  const SizedBox(height: 8),
                                  Row(
                                    children: [
                                      Expanded(
                                        child: TextFormField(
                                          key: ValueKey(
                                            'followup-days-$index-${draft.daysOffset}',
                                          ),
                                          initialValue:
                                              '${draft.daysOffset.clamp(0, 70)}',
                                          keyboardType: TextInputType.number,
                                          decoration: const InputDecoration(
                                            labelText:
                                                'Follow-up in X days (0-70)',
                                          ),
                                          onChanged: (value) {
                                            final parsed = int.tryParse(
                                              value.trim(),
                                            );
                                            if (parsed == null) {
                                              return;
                                            }
                                            setDialogState(() {
                                              draft.daysOffset = parsed.clamp(
                                                0,
                                                70,
                                              );
                                              final followUpDate =
                                                  DateTime.now().add(
                                                    Duration(
                                                      days: draft.daysOffset,
                                                    ),
                                                  );
                                              draft.calendarDateIso = _isoDate(
                                                followUpDate,
                                              );
                                              draft.day = _dayIndexFromIso(
                                                draft.calendarDateIso,
                                              );
                                              final roleWeekStart = controller
                                                  .weekStartForTrack(
                                                    draft
                                                        .assignedRole
                                                        .defaultTrack,
                                                  );
                                              final nextRoleWeekStart =
                                                  roleWeekStart.add(
                                                    const Duration(days: 7),
                                                  );
                                              draft.weekOffset =
                                                  followUpDate.isBefore(
                                                    nextRoleWeekStart,
                                                  )
                                                  ? 0
                                                  : 1;
                                            });
                                          },
                                        ),
                                      ),
                                      const SizedBox(width: 8),
                                      IconButton(
                                        tooltip: 'Decrease days',
                                        onPressed: () {
                                          setDialogState(() {
                                            draft.daysOffset =
                                                (draft.daysOffset - 1).clamp(
                                                  0,
                                                  70,
                                                );
                                            final followUpDate = DateTime.now()
                                                .add(
                                                  Duration(
                                                    days: draft.daysOffset,
                                                  ),
                                                );
                                            draft.calendarDateIso = _isoDate(
                                              followUpDate,
                                            );
                                            draft.day = _dayIndexFromIso(
                                              draft.calendarDateIso,
                                            );
                                            final roleWeekStart = controller
                                                .weekStartForTrack(
                                                  draft
                                                      .assignedRole
                                                      .defaultTrack,
                                                );
                                            final nextRoleWeekStart =
                                                roleWeekStart.add(
                                                  const Duration(days: 7),
                                                );
                                            draft.weekOffset =
                                                followUpDate.isBefore(
                                                  nextRoleWeekStart,
                                                )
                                                ? 0
                                                : 1;
                                          });
                                        },
                                        icon: const Icon(
                                          Icons.remove_circle_outline,
                                        ),
                                      ),
                                      IconButton(
                                        tooltip: 'Increase days',
                                        onPressed: () {
                                          setDialogState(() {
                                            draft.daysOffset =
                                                (draft.daysOffset + 1).clamp(
                                                  0,
                                                  70,
                                                );
                                            final followUpDate = DateTime.now()
                                                .add(
                                                  Duration(
                                                    days: draft.daysOffset,
                                                  ),
                                                );
                                            draft.calendarDateIso = _isoDate(
                                              followUpDate,
                                            );
                                            draft.day = _dayIndexFromIso(
                                              draft.calendarDateIso,
                                            );
                                            final roleWeekStart = controller
                                                .weekStartForTrack(
                                                  draft
                                                      .assignedRole
                                                      .defaultTrack,
                                                );
                                            final nextRoleWeekStart =
                                                roleWeekStart.add(
                                                  const Duration(days: 7),
                                                );
                                            draft.weekOffset =
                                                followUpDate.isBefore(
                                                  nextRoleWeekStart,
                                                )
                                                ? 0
                                                : 1;
                                          });
                                        },
                                        icon: const Icon(
                                          Icons.add_circle_outline,
                                        ),
                                      ),
                                    ],
                                  ),
                                  const SizedBox(height: 8),
                                  DropdownButtonFormField<int>(
                                    initialValue: draft.weekOffset,
                                    items: const [
                                      DropdownMenuItem<int>(
                                        value: 0,
                                        child: Text('This week'),
                                      ),
                                      DropdownMenuItem<int>(
                                        value: 1,
                                        child: Text('Next week'),
                                      ),
                                    ],
                                    onChanged: (value) {
                                      if (value == null) {
                                        return;
                                      }
                                      setDialogState(() {
                                        draft.weekOffset = value;
                                      });
                                    },
                                    decoration: const InputDecoration(
                                      labelText: 'Schedule in',
                                    ),
                                  ),
                                  const SizedBox(height: 8),
                                  DropdownButtonFormField<String>(
                                    initialValue: draft.calendarDateIso,
                                    isExpanded: true,
                                    items: mergedDateOptions.map((option) {
                                      return DropdownMenuItem<String>(
                                        value: option.iso,
                                        child: Text(option.label),
                                      );
                                    }).toList(),
                                    onChanged: (value) {
                                      if (value == null) {
                                        return;
                                      }
                                      setDialogState(() {
                                        draft.calendarDateIso = value;
                                        draft.day = _dayIndexFromIso(value);
                                        final selectedDate = DateTime.tryParse(
                                          value,
                                        );
                                        if (selectedDate != null) {
                                          final today = DateTime.now();
                                          final normalizedToday = DateTime(
                                            today.year,
                                            today.month,
                                            today.day,
                                          );
                                          final normalizedSelected = DateTime(
                                            selectedDate.year,
                                            selectedDate.month,
                                            selectedDate.day,
                                          );
                                          final days = normalizedSelected
                                              .difference(normalizedToday)
                                              .inDays;
                                          draft.daysOffset = days.clamp(0, 70);
                                        }
                                      });
                                    },
                                    decoration: const InputDecoration(
                                      labelText: 'Calendar day',
                                    ),
                                  ),
                                  const SizedBox(height: 8),
                                  DropdownButtonFormField<int>(
                                    initialValue: draft.day,
                                    items: List.generate(
                                      5,
                                      (dayIndex) => DropdownMenuItem<int>(
                                        value: dayIndex,
                                        child: Text(
                                          AppController.dayLabels[dayIndex],
                                        ),
                                      ),
                                    ),
                                    onChanged: (value) {
                                      if (value == null) {
                                        return;
                                      }
                                      setDialogState(() {
                                        draft.day = value;
                                      });
                                    },
                                    decoration: const InputDecoration(
                                      labelText: 'Preferred day',
                                    ),
                                  ),
                                  const SizedBox(height: 8),
                                  DropdownButtonFormField<int>(
                                    initialValue: draft.timeMinutes,
                                    isExpanded: true,
                                    items: _timeOptions()
                                        .map(
                                          (option) => DropdownMenuItem<int>(
                                            value: option.minutes,
                                            child: Text(option.label),
                                          ),
                                        )
                                        .toList(),
                                    onChanged: (value) {
                                      if (value == null) {
                                        return;
                                      }
                                      setDialogState(() {
                                        draft.timeMinutes = value;
                                      });
                                    },
                                    decoration: const InputDecoration(
                                      labelText: 'Time',
                                    ),
                                  ),
                                  const SizedBox(height: 8),
                                  SwitchListTile(
                                    contentPadding: EdgeInsets.zero,
                                    title: const Text(
                                      'Send completion message on done',
                                    ),
                                    subtitle: const Text(
                                      'User can send information and notify selected team member.',
                                    ),
                                    value: draft.sendCompletionMessage,
                                    onChanged: (value) {
                                      setDialogState(() {
                                        draft.sendCompletionMessage = value;
                                      });
                                    },
                                  ),
                                  if (draft.sendCompletionMessage) ...[
                                    DropdownButtonFormField<UserRole>(
                                      initialValue: draft.completionNotifyRole,
                                      isExpanded: true,
                                      items: UserRole.values
                                          .where((role) => role != UserRole.ceo)
                                          .map(
                                            (role) =>
                                                DropdownMenuItem<UserRole>(
                                                  value: role,
                                                  child: Text(role.label),
                                                ),
                                          )
                                          .toList(),
                                      onChanged: (value) {
                                        if (value == null) {
                                          return;
                                        }
                                        setDialogState(() {
                                          draft.completionNotifyRole = value;
                                        });
                                      },
                                      decoration: const InputDecoration(
                                        labelText: 'Select team member',
                                      ),
                                    ),
                                  ],
                                  SwitchListTile(
                                    contentPadding: EdgeInsets.zero,
                                    title: const Text(
                                      'Send entered data to specific team member',
                                    ),
                                    value: draft.sendDataToSpecificEmployee,
                                    onChanged: (value) {
                                      setDialogState(() {
                                        draft.sendDataToSpecificEmployee =
                                            value;
                                      });
                                    },
                                  ),
                                  if (draft.sendDataToSpecificEmployee) ...[
                                    DropdownButtonFormField<UserRole>(
                                      initialValue: draft.dataRecipientRole,
                                      isExpanded: true,
                                      items: UserRole.values
                                          .where((role) => role != UserRole.ceo)
                                          .map(
                                            (role) =>
                                                DropdownMenuItem<UserRole>(
                                                  value: role,
                                                  child: Text(role.label),
                                                ),
                                          )
                                          .toList(),
                                      onChanged: (value) {
                                        if (value == null) {
                                          return;
                                        }
                                        setDialogState(() {
                                          draft.dataRecipientRole = value;
                                        });
                                      },
                                      decoration: const InputDecoration(
                                        labelText: 'Specific team member',
                                      ),
                                    ),
                                    const SizedBox(height: 8),
                                    TextFormField(
                                      initialValue: draft.defaultDataEntryText,
                                      maxLines: 3,
                                      decoration: const InputDecoration(
                                        labelText: 'Data text box',
                                        hintText:
                                            'Type data here, or use voice dictation below.',
                                      ),
                                      onChanged: (value) {
                                        draft.defaultDataEntryText = value;
                                      },
                                    ),
                                    SwitchListTile(
                                      contentPadding: EdgeInsets.zero,
                                      title: const Text(
                                        'Allow voice dictation',
                                      ),
                                      value: draft.allowVoiceDictation,
                                      onChanged: (value) {
                                        setDialogState(() {
                                          draft.allowVoiceDictation = value;
                                        });
                                      },
                                    ),
                                    if (draft.allowVoiceDictation)
                                      Align(
                                        alignment: Alignment.centerLeft,
                                        child: OutlinedButton.icon(
                                          onPressed: () async {
                                            final speech = stt.SpeechToText();
                                            final ready =
                                                await speech.initialize();
                                            if (!ready || !context.mounted) {
                                              return;
                                            }
                                            await speech.listen(
                                              listenOptions:
                                                  stt.SpeechListenOptions(
                                                    listenMode:
                                                        stt.ListenMode.dictation,
                                                    partialResults: true,
                                                  ),
                                              onResult: (result) {
                                                if (!context.mounted) {
                                                  return;
                                                }
                                                setDialogState(() {
                                                  draft.defaultDataEntryText =
                                                      result.recognizedWords;
                                                });
                                              },
                                            );
                                          },
                                          icon: const Icon(Icons.mic),
                                          label: const Text(
                                            'Voice dictation to data box',
                                          ),
                                        ),
                                      ),
                                  ],
                                ],
                              ),
                            ),
                          );
                        }),
                        if (followUpDrafts.length < 5)
                          Align(
                            alignment: Alignment.centerLeft,
                            child: TextButton.icon(
                              onPressed: () {
                                setDialogState(() {
                                  followUpDrafts.add(_FollowUpDraft());
                                });
                              },
                              icon: const Icon(Icons.add),
                              label: const Text('Add follow-up task'),
                            ),
                          ),
                      ],
                      const SizedBox(height: 6),
                    ],
                  ),
                ),
              ),
              actions: [
                TextButton(
                  onPressed: () {
                    Navigator.of(context).pop(false);
                  },
                  child: const Text('Back'),
                ),
                FilledButton(
                  onPressed: () {
                    final title = titleValue.trim();
                    final room = selectedRoom.trim();
                    final category = selectedCategory.trim();

                    if (title.isEmpty || room.isEmpty || category.isEmpty) {
                      return;
                    }

                    final normalizedFollowUps = autoFollowUp
                        ? followUpDrafts
                              .map(
                                (draft) => FollowUpRule(
                                  title: draft.title.trim(),
                                  priority: draft.priority,
                                  hours: draft.hours,
                                  assignedRole: draft.assignedRole,
                                  daysOffset: draft.daysOffset.clamp(0, 70),
                                  weekOffset: draft.weekOffset,
                                  day: draft.day,
                                  calendarDateIso:
                                      draft.calendarDateIso.trim().isEmpty
                                      ? _isoDate(
                                          DateTime.now().add(
                                            Duration(
                                              days: draft.daysOffset.clamp(
                                                0,
                                                70,
                                              ),
                                            ),
                                          ),
                                        )
                                      : draft.calendarDateIso,
                                  timeMinutes: draft.timeMinutes,
                                  sendCompletionMessage:
                                      draft.sendCompletionMessage,
                                  completionNotifyRole:
                                      draft.completionNotifyRole,
                                  defaultDataEntryText:
                                      draft.defaultDataEntryText.trim(),
                                  sendDataToSpecificEmployee:
                                      draft.sendDataToSpecificEmployee,
                                  dataRecipientRole: draft.dataRecipientRole,
                                  allowVoiceDictation:
                                      draft.allowVoiceDictation,
                                ),
                              )
                              .where((rule) => rule.title.isNotEmpty)
                              .take(5)
                              .toList()
                        : <FollowUpRule>[];
                    final firstFollowUp = normalizedFollowUps.isEmpty
                        ? null
                        : normalizedFollowUps.first;

                    if (existing == null) {
                      controller.createTemplate(
                        track: track,
                        title: title,
                        room: room,
                        category: category,
                        priority: priority,
                        defaultHours: hours,
                        autoFollowUp: normalizedFollowUps.isNotEmpty,
                        followUpTitle: firstFollowUp?.title ?? '',
                        followUpPriority: firstFollowUp?.priority ?? 3,
                        followUpHours: firstFollowUp?.hours ?? 1.0,
                        followUpRules: normalizedFollowUps,
                        sendCompletionMessage: false,
                        completionNotifyRole: UserRole.generalManager,
                        completionActionRequiredByDefault:
                            completionActionRequiredByDefault,
                      );
                    } else {
                      controller.updateTemplate(
                        existing.copyWith(
                          title: title,
                          room: room,
                          category: category,
                          priority: priority,
                          defaultHours: hours,
                          autoFollowUp: normalizedFollowUps.isNotEmpty,
                          followUpTitle: firstFollowUp?.title ?? '',
                          followUpPriority: firstFollowUp?.priority ?? 3,
                          followUpHours: firstFollowUp?.hours ?? 1.0,
                          followUpRules: normalizedFollowUps,
                          sendCompletionMessage: false,
                          completionNotifyRole: UserRole.generalManager,
                          completionActionRequiredByDefault:
                              completionActionRequiredByDefault,
                        ),
                      );
                    }

                    Navigator.of(context).pop(true);
                  },
                  child: const Text('Save'),
                ),
              ],
            );
          },
        );
      },
    );

    if (result == true && context.mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            existing == null ? 'Assessment created.' : 'Assessment updated.',
          ),
        ),
      );
    }
  }

  Future<String?> _promptForNewDropdownValue(
    BuildContext context, {
    required String fieldLabel,
  }) async {
    var draftValue = '';
    final created = await showDialog<String>(
      context: context,
      builder: (context) {
        return AlertDialog(
          title: Text('New $fieldLabel'),
          content: TextFormField(
            autofocus: true,
            decoration: InputDecoration(labelText: '$fieldLabel name'),
            onChanged: (value) {
              draftValue = value;
            },
            onFieldSubmitted: (_) {
              final cleaned = draftValue.trim();
              Navigator.of(context).pop(cleaned.isEmpty ? null : cleaned);
            },
          ),
          actions: [
            TextButton(
              onPressed: () {
                Navigator.of(context).pop();
              },
              child: const Text('Cancel'),
            ),
            FilledButton(
              onPressed: () {
                final cleaned = draftValue.trim();
                Navigator.of(context).pop(cleaned.isEmpty ? null : cleaned);
              },
              child: const Text('Add'),
            ),
          ],
        );
      },
    );
    if (created == null || created.trim().isEmpty) {
      return null;
    }
    return created.trim();
  }

  bool _readTemplateBool(
    AssessmentTemplate? template,
    bool Function(AssessmentTemplate template) selector,
    bool fallback,
  ) {
    if (template == null) {
      return fallback;
    }
    try {
      return selector(template);
    } catch (_) {
      return fallback;
    }
  }

  List<_FollowUpDraft> _initialFollowUpDrafts(AssessmentTemplate? existing) {
    final drafts = <_FollowUpDraft>[];
    if (existing != null) {
      try {
        if (existing.followUpRules.isNotEmpty) {
          for (final rule in existing.followUpRules.take(5)) {
            drafts.add(
              _FollowUpDraft(
                title: rule.title,
                priority: rule.priority,
                hours: rule.hours,
                assignedRole: rule.assignedRole,
                daysOffset: rule.daysOffset,
                weekOffset: rule.weekOffset,
                day: rule.day,
                calendarDateIso: rule.calendarDateIso,
                timeMinutes: rule.timeMinutes,
                sendCompletionMessage: rule.sendCompletionMessage,
                completionNotifyRole: rule.completionNotifyRole,
                defaultDataEntryText: rule.defaultDataEntryText,
                sendDataToSpecificEmployee: rule.sendDataToSpecificEmployee,
                dataRecipientRole: rule.dataRecipientRole,
                allowVoiceDictation: rule.allowVoiceDictation,
              ),
            );
          }
        }
      } catch (_) {
        // Handles hot-reload shape changes for legacy in-memory template objects.
      }
    }
    if (drafts.isEmpty &&
        existing != null &&
        existing.autoFollowUp &&
        existing.followUpTitle.trim().isNotEmpty) {
      drafts.add(
        _FollowUpDraft(
          title: existing.followUpTitle,
          priority: existing.followUpPriority,
          hours: existing.followUpHours,
          assignedRole: UserRole.producer,
          daysOffset: 7,
          weekOffset: 1,
          day: 0,
          calendarDateIso: '',
          timeMinutes: 9 * 60,
        ),
      );
    }
    if (drafts.isEmpty) {
      drafts.add(_FollowUpDraft());
    }
    return drafts;
  }

  List<_DateOption> _dateOptionsForFollowUp(
    AppController controller,
    AssessmentTrack track,
    int weekOffset,
  ) {
    final baseWeekStart = controller
        .weekStartForTrack(track)
        .add(Duration(days: weekOffset * 7));
    return List.generate(5, (index) {
      final date = baseWeekStart.add(Duration(days: index));
      final iso = _isoDate(date);
      final label =
          '${AppController.dayLabels[index]} • ${date.month}/${date.day}/${date.year}';
      return _DateOption(iso: iso, label: label);
    });
  }

  List<_TimeOption> _timeOptions() {
    final options = <_TimeOption>[];
    for (var minutes = 0; minutes < 24 * 60; minutes += 15) {
      options.add(_TimeOption(minutes: minutes, label: _formatTime(minutes)));
    }
    return options;
  }

  String _formatTime(int totalMinutes) {
    final hour24 = totalMinutes ~/ 60;
    final minute = totalMinutes % 60;
    final period = hour24 >= 12 ? 'PM' : 'AM';
    final hour12 = hour24 % 12 == 0 ? 12 : hour24 % 12;
    return '$hour12:${minute.toString().padLeft(2, '0')} $period';
  }

  int _dayIndexFromIso(String iso) {
    try {
      final date = DateTime.parse(iso);
      return (date.weekday - DateTime.monday).clamp(0, 4).toInt();
    } catch (_) {
      return 0;
    }
  }

  String _isoDate(DateTime date) {
    final year = date.year.toString().padLeft(4, '0');
    final month = date.month.toString().padLeft(2, '0');
    final day = date.day.toString().padLeft(2, '0');
    return '$year-$month-$day';
  }
}

class _FollowUpDraft {
  _FollowUpDraft({
    this.title = '',
    this.priority = 3,
    this.hours = 1.0,
    this.assignedRole = UserRole.producer,
    this.daysOffset = 0,
    this.weekOffset = 1,
    this.day = 0,
    this.calendarDateIso = '',
    this.timeMinutes = 9 * 60,
    this.sendCompletionMessage = false,
    this.completionNotifyRole = UserRole.generalManager,
    this.defaultDataEntryText = '',
    this.sendDataToSpecificEmployee = false,
    this.dataRecipientRole = UserRole.producer,
    this.allowVoiceDictation = true,
  });

  String title;
  int priority;
  double hours;
  UserRole assignedRole;
  int daysOffset;
  int weekOffset;
  int day;
  String calendarDateIso;
  int timeMinutes;
  bool sendCompletionMessage;
  UserRole completionNotifyRole;
  String defaultDataEntryText;
  bool sendDataToSpecificEmployee;
  UserRole dataRecipientRole;
  bool allowVoiceDictation;
}

class _DateOption {
  const _DateOption({required this.iso, required this.label});

  final String iso;
  final String label;
}

class _TimeOption {
  const _TimeOption({required this.minutes, required this.label});

  final int minutes;
  final String label;
}

enum UserRole {
  ceo,
  generalManager,
  producer,
  budtenderTd,
  budtenderTdJunior,
  budtenderJoSenior,
  budtenderJoJunior,
}

extension UserRoleX on UserRole {
  String get label {
    switch (this) {
      case UserRole.ceo:
        return 'CEO';
      case UserRole.generalManager:
        return 'General Manager';
      case UserRole.producer:
        return 'Producer';
      case UserRole.budtenderTd:
        return 'Budtender TD';
      case UserRole.budtenderTdJunior:
        return 'Budtender TD Junior';
      case UserRole.budtenderJoSenior:
        return 'Budtender JO Senior';
      case UserRole.budtenderJoJunior:
        return 'Budtender JO Junior';
    }
  }

  bool get canAdmin => this == UserRole.ceo;

  bool get canPlan {
    switch (this) {
      case UserRole.ceo:
      case UserRole.generalManager:
      case UserRole.producer:
      case UserRole.budtenderTd:
      case UserRole.budtenderJoSenior:
        return true;
      case UserRole.budtenderTdJunior:
      case UserRole.budtenderJoJunior:
        return false;
    }
  }

  AssessmentTrack get defaultTrack {
    switch (this) {
      case UserRole.ceo:
      case UserRole.producer:
      case UserRole.budtenderTd:
      case UserRole.budtenderTdJunior:
        return AssessmentTrack.producer;
      case UserRole.generalManager:
        return AssessmentTrack.generalManager;
      case UserRole.budtenderJoSenior:
      case UserRole.budtenderJoJunior:
        return AssessmentTrack.joManager;
    }
  }
}

enum AssessmentTrack { producer, generalManager, joManager }

extension AssessmentTrackX on AssessmentTrack {
  String get label {
    switch (this) {
      case AssessmentTrack.producer:
        return 'Producer';
      case AssessmentTrack.generalManager:
        return 'General Manager';
      case AssessmentTrack.joManager:
        return 'JO Manager';
    }
  }
}

class AssessmentTemplate {
  const AssessmentTemplate({
    required this.id,
    required this.track,
    required this.title,
    required this.room,
    required this.category,
    required this.priority,
    required this.defaultHours,
    this.autoFollowUp = false,
    this.followUpTitle = '',
    this.followUpPriority = 3,
    this.followUpHours = 1.0,
    this.followUpRules = const [],
    this.sendCompletionMessage = false,
    this.completionNotifyRole = UserRole.generalManager,
    this.completionActionRequiredByDefault = true,
    this.sendDataToSpecificEmployee = false,
    this.dataRecipientRole = UserRole.producer,
    this.allowVoiceDictation = true,
  });

  final String id;
  final AssessmentTrack track;
  final String title;
  final String room;
  final String category;
  final int priority;
  final double defaultHours;
  final bool autoFollowUp;
  final String followUpTitle;
  final int followUpPriority;
  final double followUpHours;
  final List<FollowUpRule> followUpRules;
  final bool sendCompletionMessage;
  final UserRole completionNotifyRole;
  final bool completionActionRequiredByDefault;
  final bool sendDataToSpecificEmployee;
  final UserRole dataRecipientRole;
  final bool allowVoiceDictation;

  AssessmentTemplate copyWith({
    AssessmentTrack? track,
    String? title,
    String? room,
    String? category,
    int? priority,
    double? defaultHours,
    bool? autoFollowUp,
    String? followUpTitle,
    int? followUpPriority,
    double? followUpHours,
    List<FollowUpRule>? followUpRules,
    bool? sendCompletionMessage,
    UserRole? completionNotifyRole,
    bool? completionActionRequiredByDefault,
    bool? sendDataToSpecificEmployee,
    UserRole? dataRecipientRole,
    bool? allowVoiceDictation,
  }) {
    return AssessmentTemplate(
      id: id,
      track: track ?? this.track,
      title: title ?? this.title,
      room: room ?? this.room,
      category: category ?? this.category,
      priority: priority ?? this.priority,
      defaultHours: defaultHours ?? this.defaultHours,
      autoFollowUp: autoFollowUp ?? this.autoFollowUp,
      followUpTitle: followUpTitle ?? this.followUpTitle,
      followUpPriority: followUpPriority ?? this.followUpPriority,
      followUpHours: followUpHours ?? this.followUpHours,
      followUpRules: followUpRules ?? this.followUpRules,
      sendCompletionMessage:
          sendCompletionMessage ?? this.sendCompletionMessage,
      completionNotifyRole: completionNotifyRole ?? this.completionNotifyRole,
      completionActionRequiredByDefault:
          completionActionRequiredByDefault ??
          this.completionActionRequiredByDefault,
      sendDataToSpecificEmployee:
          sendDataToSpecificEmployee ?? this.sendDataToSpecificEmployee,
      dataRecipientRole: dataRecipientRole ?? this.dataRecipientRole,
      allowVoiceDictation: allowVoiceDictation ?? this.allowVoiceDictation,
    );
  }
}

class FollowUpRule {
  const FollowUpRule({
    required this.title,
    required this.priority,
    required this.hours,
    this.assignedRole = UserRole.producer,
    this.daysOffset = 0,
    required this.weekOffset,
    required this.day,
    this.calendarDateIso = '',
    this.timeMinutes = 9 * 60,
    this.sendCompletionMessage = false,
    this.completionNotifyRole = UserRole.generalManager,
    this.defaultDataEntryText = '',
    this.sendDataToSpecificEmployee = false,
    this.dataRecipientRole = UserRole.producer,
    this.allowVoiceDictation = true,
  });

  final String title;
  final int priority;
  final double hours;
  final UserRole assignedRole;
  final int daysOffset;
  final int weekOffset;
  final int day;
  final String calendarDateIso;
  final int timeMinutes;
  final bool sendCompletionMessage;
  final UserRole completionNotifyRole;
  final String defaultDataEntryText;
  final bool sendDataToSpecificEmployee;
  final UserRole dataRecipientRole;
  final bool allowVoiceDictation;
}

class CompletionDispatch {
  const CompletionDispatch({
    required this.recipients,
    required this.notes,
    required this.tags,
    required this.attachments,
    required this.actionRequired,
    this.titleOverride = '',
  });

  final List<UserRole> recipients;
  final String notes;
  final List<String> tags;
  final List<MessageAttachment> attachments;
  final bool actionRequired;
  final String titleOverride;
}

class MessageAttachment {
  const MessageAttachment({required this.name, required this.bytes});

  final String name;
  final Uint8List bytes;
}

class InboxMessage {
  const InboxMessage({
    required this.id,
    required this.fromRole,
    required this.toRole,
    required this.title,
    required this.notes,
    required this.tags,
    required this.attachments,
    required this.createdAt,
    required this.actionRequired,
    required this.isRead,
  });

  final String id;
  final UserRole fromRole;
  final UserRole toRole;
  final String title;
  final String notes;
  final List<String> tags;
  final List<MessageAttachment> attachments;
  final DateTime createdAt;
  final bool actionRequired;
  final bool isRead;

  InboxMessage copyWith({bool? isRead}) {
    return InboxMessage(
      id: id,
      fromRole: fromRole,
      toRole: toRole,
      title: title,
      notes: notes,
      tags: tags,
      attachments: attachments,
      createdAt: createdAt,
      actionRequired: actionRequired,
      isRead: isRead ?? this.isRead,
    );
  }
}

class PlannedAssessmentRequest {
  const PlannedAssessmentRequest({
    required this.id,
    required this.track,
    required this.templateId,
    required this.title,
    required this.room,
    required this.category,
    required this.priority,
    required this.estimatedHours,
    required this.preferredDay,
    required this.createdAt,
    required this.completed,
    required this.followUpGenerated,
    this.sendCompletionMessage = false,
    this.completionNotifyRole = UserRole.generalManager,
    this.completionActionRequiredByDefault = true,
    this.sendDataToSpecificEmployee = false,
    this.dataRecipientRole = UserRole.producer,
    this.allowVoiceDictation = true,
    this.defaultDataEntryText = '',
    this.scheduledDateIso = '',
  });

  final String id;
  final AssessmentTrack track;
  final String templateId;
  final String title;
  final String room;
  final String category;
  final int priority;
  final double estimatedHours;
  final int preferredDay;
  final DateTime createdAt;
  final bool completed;
  final bool followUpGenerated;
  final bool sendCompletionMessage;
  final UserRole completionNotifyRole;
  final bool completionActionRequiredByDefault;
  final bool sendDataToSpecificEmployee;
  final UserRole dataRecipientRole;
  final bool allowVoiceDictation;
  final String defaultDataEntryText;
  final String scheduledDateIso;

  PlannedAssessmentRequest copyWith({
    int? priority,
    double? estimatedHours,
    int? preferredDay,
    bool? completed,
    bool? followUpGenerated,
    bool? sendCompletionMessage,
    UserRole? completionNotifyRole,
    bool? completionActionRequiredByDefault,
    bool? sendDataToSpecificEmployee,
    UserRole? dataRecipientRole,
    bool? allowVoiceDictation,
    String? defaultDataEntryText,
    String? scheduledDateIso,
  }) {
    return PlannedAssessmentRequest(
      id: id,
      track: track,
      templateId: templateId,
      title: title,
      room: room,
      category: category,
      priority: priority ?? this.priority,
      estimatedHours: estimatedHours ?? this.estimatedHours,
      preferredDay: preferredDay ?? this.preferredDay,
      createdAt: createdAt,
      completed: completed ?? this.completed,
      followUpGenerated: followUpGenerated ?? this.followUpGenerated,
      sendCompletionMessage:
          sendCompletionMessage ?? this.sendCompletionMessage,
      completionNotifyRole: completionNotifyRole ?? this.completionNotifyRole,
      completionActionRequiredByDefault:
          completionActionRequiredByDefault ??
          this.completionActionRequiredByDefault,
      sendDataToSpecificEmployee:
          sendDataToSpecificEmployee ?? this.sendDataToSpecificEmployee,
      dataRecipientRole: dataRecipientRole ?? this.dataRecipientRole,
      allowVoiceDictation: allowVoiceDictation ?? this.allowVoiceDictation,
      defaultDataEntryText: defaultDataEntryText ?? this.defaultDataEntryText,
      scheduledDateIso: scheduledDateIso ?? this.scheduledDateIso,
    );
  }
}

class WeekTask {
  const WeekTask({
    required this.id,
    required this.track,
    required this.sourceTemplateId,
    required this.title,
    required this.room,
    required this.category,
    required this.priority,
    required this.estimatedHours,
    required this.day,
    required this.completed,
    required this.fromOverflow,
    required this.isFollowUp,
    this.sendCompletionMessage = false,
    this.completionNotifyRole = UserRole.generalManager,
    this.completionActionRequiredByDefault = true,
    this.sendDataToSpecificEmployee = false,
    this.dataRecipientRole = UserRole.producer,
    this.allowVoiceDictation = true,
    this.defaultDataEntryText = '',
    this.scheduledDateIso = '',
  });

  final String id;
  final AssessmentTrack track;
  final String sourceTemplateId;
  final String title;
  final String room;
  final String category;
  final int priority;
  final double estimatedHours;
  final int? day;
  final bool completed;
  final bool fromOverflow;
  final bool isFollowUp;
  final bool sendCompletionMessage;
  final UserRole completionNotifyRole;
  final bool completionActionRequiredByDefault;
  final bool sendDataToSpecificEmployee;
  final UserRole dataRecipientRole;
  final bool allowVoiceDictation;
  final String defaultDataEntryText;
  final String scheduledDateIso;

  WeekTask copyWith({
    bool? completed,
    String? scheduledDateIso,
    bool? sendCompletionMessage,
    UserRole? completionNotifyRole,
    bool? completionActionRequiredByDefault,
    bool? sendDataToSpecificEmployee,
    UserRole? dataRecipientRole,
    bool? allowVoiceDictation,
    String? defaultDataEntryText,
  }) {
    return WeekTask(
      id: id,
      track: track,
      sourceTemplateId: sourceTemplateId,
      title: title,
      room: room,
      category: category,
      priority: priority,
      estimatedHours: estimatedHours,
      day: day,
      completed: completed ?? this.completed,
      fromOverflow: fromOverflow,
      isFollowUp: isFollowUp,
      sendCompletionMessage:
          sendCompletionMessage ?? this.sendCompletionMessage,
      completionNotifyRole: completionNotifyRole ?? this.completionNotifyRole,
      completionActionRequiredByDefault:
          completionActionRequiredByDefault ??
          this.completionActionRequiredByDefault,
      sendDataToSpecificEmployee:
          sendDataToSpecificEmployee ?? this.sendDataToSpecificEmployee,
      dataRecipientRole: dataRecipientRole ?? this.dataRecipientRole,
      allowVoiceDictation: allowVoiceDictation ?? this.allowVoiceDictation,
      defaultDataEntryText: defaultDataEntryText ?? this.defaultDataEntryText,
      scheduledDateIso: scheduledDateIso ?? this.scheduledDateIso,
    );
  }
}

class PlanAssessmentResult {
  const PlanAssessmentResult({required this.requestedDay, this.assignedDay});

  final int requestedDay;
  final int? assignedDay;

  bool get movedToDifferentDay =>
      assignedDay != null && assignedDay != requestedDay;
}

class SuppliesRequestDraft {
  const SuppliesRequestDraft({this.notes = '', this.neededByIso = ''});

  final String notes;
  final String neededByIso;
}

class AppController extends ChangeNotifier {
  static const String _templatesStorageKey = 'm.templates.v1';
  static const String _suppliesDraftStorageKey = 'm.supplies_drafts.v1';
  static const List<String> dayLabels = [
    'Monday',
    'Tuesday',
    'Wednesday',
    'Thursday',
    'Friday',
  ];
  static const double dayHourLimit = 8.0;
  static const double weekHourLimit = 40.0;
  static List<double> hourStepOptions({
    double min = 10 / 60,
    double max = 8.0,
  }) {
    final values = <double>[];
    var current = min;
    while (current <= 1.0 + 0.0001) {
      values.add(double.parse(current.toStringAsFixed(4)));
      current += 10 / 60;
    }
    current = 1.25;
    while (current <= max + 0.0001) {
      values.add(double.parse(current.toStringAsFixed(4)));
      current += 0.25;
    }
    return values.toSet().toList()..sort();
  }

  static String formatHoursLabel(double hours) {
    final totalMinutes = (hours * 60).round();
    if (totalMinutes < 60) {
      return '${totalMinutes}m';
    }
    final wholeHours = totalMinutes ~/ 60;
    final remainder = totalMinutes % 60;
    if (remainder == 0) {
      return '${wholeHours}h';
    }
    return '${wholeHours}h ${remainder}m';
  }

  static const List<String> _monthNames = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ];

  bool _isLoading = true;
  UserRole _selectedRole = UserRole.ceo;
  AssessmentTrack _ceoTrack = AssessmentTrack.producer;

  final List<AssessmentTemplate> _templates = [];
  final Map<AssessmentTrack, List<PlannedAssessmentRequest>> _requestsByTrack =
      {
        for (final track in AssessmentTrack.values)
          track: <PlannedAssessmentRequest>[],
      };
  final Map<AssessmentTrack, List<WeekTask>> _explicitNextByTrack = {
    for (final track in AssessmentTrack.values) track: <WeekTask>[],
  };
  final Map<AssessmentTrack, List<WeekTask>> _thisWeekByTrack = {
    for (final track in AssessmentTrack.values) track: <WeekTask>[],
  };
  final Map<AssessmentTrack, List<WeekTask>> _overflowByTrack = {
    for (final track in AssessmentTrack.values) track: <WeekTask>[],
  };
  final Map<AssessmentTrack, Map<int, double>> _dailyLoadsByTrack = {
    for (final track in AssessmentTrack.values)
      track: {for (var i = 0; i < 5; i++) i: 0.0},
  };
  final Map<AssessmentTrack, double> _weekLoadByTrack = {
    for (final track in AssessmentTrack.values) track: 0.0,
  };
  final Map<AssessmentTrack, DateTime> _weekStartByTrack = {
    for (final track in AssessmentTrack.values) track: _currentWeekStart(),
  };
  final Map<AssessmentTrack, Set<String>> _notNeededThisWeekByTrack = {
    for (final track in AssessmentTrack.values) track: <String>{},
  };
  final Map<AssessmentTrack, Set<String>> _closingDoneByTrack = {
    for (final track in AssessmentTrack.values) track: <String>{},
  };
  final Map<UserRole, List<InboxMessage>> _inboxByRole = {
    for (final role in UserRole.values) role: <InboxMessage>[],
  };
  final Map<String, SuppliesRequestDraft> _suppliesDraftByTemplateId = {};

  int _idCounter = 1;

  bool get isLoading => _isLoading;
  UserRole get selectedRole => _selectedRole;
  AssessmentTrack get ceoTrack => _ceoTrack;

  AssessmentTrack get activeTrack {
    if (_selectedRole == UserRole.ceo) {
      return _ceoTrack;
    }
    return _selectedRole.defaultTrack;
  }

  double get weekLoad => _weekLoadByTrack[activeTrack] ?? 0;

  List<WeekTask> get thisWeekSchedule =>
      List.unmodifiable(_thisWeekByTrack[activeTrack] ?? const []);

  List<WeekTask> get overflowTasks =>
      List.unmodifiable(_overflowByTrack[activeTrack] ?? const []);
  Set<String> get notNeededTemplateIdsForActiveTrack =>
      Set.unmodifiable(_notNeededThisWeekByTrack[activeTrack] ?? const {});
  List<WeekTask> get allScheduledCalendarTasksForActiveTrack {
    final combined = <WeekTask>[
      ...(_thisWeekByTrack[activeTrack] ?? const <WeekTask>[]),
      ...(_explicitNextByTrack[activeTrack] ?? const <WeekTask>[]),
    ];
    combined.sort((a, b) {
      final aDate = DateTime.tryParse(a.scheduledDateIso);
      final bDate = DateTime.tryParse(b.scheduledDateIso);
      if (aDate != null && bDate != null) {
        final byDate = aDate.compareTo(bDate);
        if (byDate != 0) {
          return byDate;
        }
      }
      final byPriority = a.priority.compareTo(b.priority);
      if (byPriority != 0) {
        return byPriority;
      }
      return a.title.compareTo(b.title);
    });
    final seen = <String>{};
    final unique = <WeekTask>[];
    for (final task in combined) {
      final key =
          '${task.scheduledDateIso}|${task.title.toLowerCase()}|${task.room.toLowerCase()}|'
          '${task.priority}|${task.estimatedHours.toStringAsFixed(4)}';
      if (seen.add(key)) {
        unique.add(task);
      }
    }
    return unique;
  }

  List<InboxMessage> get inboxForSelectedRole =>
      List.unmodifiable(_inboxByRole[_selectedRole] ?? const []);
  int get unreadInboxCountForSelectedRole =>
      (_inboxByRole[_selectedRole] ?? const [])
          .where((message) => !message.isRead)
          .length;
  List<UserRole> get recipientRoleOptions =>
      UserRole.values.where((role) => role != _selectedRole).toList();

  String get weekLabel {
    final weekStart = _weekStartByTrack[activeTrack]!;
    final weekEnd = weekStart.add(const Duration(days: 4));
    return 'Week of ${_formatDate(weekStart)} - ${_formatDate(weekEnd)}';
  }

  DateTime weekStartForTrack(AssessmentTrack track) {
    return _weekStartByTrack[track] ?? _currentWeekStart();
  }

  String formatTimestamp(DateTime value) {
    final hour12 = value.hour % 12 == 0 ? 12 : value.hour % 12;
    final minute = value.minute.toString().padLeft(2, '0');
    final meridiem = value.hour >= 12 ? 'PM' : 'AM';
    return '${_formatDate(value)} $hour12:$minute $meridiem';
  }

  Future<void> loadInitialAssessments() async {
    _isLoading = true;
    notifyListeners();

    try {
      final loadedFromStorage = await _loadTemplatesFromStorage();
      if (!loadedFromStorage) {
        await _loadTrackFile(
          'assets/data/producer_assessments.json',
          AssessmentTrack.producer,
        );
        await _loadTrackFile(
          'assets/data/general_manager_assessments.json',
          AssessmentTrack.generalManager,
        );
        await _loadTrackFile(
          'assets/data/jo_manager_assessments.json',
          AssessmentTrack.joManager,
        );
      }
    } catch (_) {
      // Keep the app operational even if a seed file is unavailable.
    }

    _sortTemplates();
    _removeObsoleteSuppliesPrompts();
    await _loadSuppliesDraftsFromStorage();
    _isLoading = false;
    notifyListeners();
  }

  Future<void> _loadTrackFile(String path, AssessmentTrack track) async {
    final raw = await rootBundle.loadString(path);
    final decoded = jsonDecode(raw) as List<dynamic>;

    for (final entry in decoded) {
      final map = entry as Map<String, dynamic>;
      final priority = _clampPriority((map['priority'] as num?)?.toInt() ?? 3);
      _templates.add(
        AssessmentTemplate(
          id: _newId('seed'),
          track: track,
          title: (map['title'] ?? '').toString().trim(),
          room: (map['room'] ?? 'General').toString().trim(),
          category: (map['category'] ?? 'General').toString().trim(),
          priority: priority,
          defaultHours: _clampHours(
            (map['defaultHours'] as num?)?.toDouble() ?? 1.0,
          ),
          autoFollowUp: false,
          followUpTitle: '',
          followUpPriority: 3,
          followUpHours: 1.0,
        ),
      );
    }
  }

  void setRole(UserRole role) {
    _selectedRole = role;
    notifyListeners();
  }

  void setCeoTrack(AssessmentTrack track) {
    _ceoTrack = track;
    notifyListeners();
  }

  void markInboxMessageRead(String messageId) {
    final messages = _inboxByRole[_selectedRole]!;
    final index = messages.indexWhere((message) => message.id == messageId);
    if (index == -1 || messages[index].isRead) {
      return;
    }
    messages[index] = messages[index].copyWith(isRead: true);
    notifyListeners();
  }

  void markAllInboxMessagesReadForSelectedRole() {
    final messages = _inboxByRole[_selectedRole]!;
    var changed = false;
    for (var i = 0; i < messages.length; i++) {
      if (!messages[i].isRead) {
        messages[i] = messages[i].copyWith(isRead: true);
        changed = true;
      }
    }
    if (changed) {
      notifyListeners();
    }
  }

  void sendInboxMessage({
    required List<UserRole> recipients,
    required String title,
    required String notes,
    List<String> tags = const [],
    List<MessageAttachment> attachments = const [],
    bool actionRequired = false,
  }) {
    final normalizedTitle = title.trim();
    if (normalizedTitle.isEmpty || recipients.isEmpty) {
      return;
    }
    final now = DateTime.now();
    final uniqueRecipients = recipients.toSet().toList();
    for (final recipient in uniqueRecipients) {
      if (recipient == _selectedRole) {
        continue;
      }
      _inboxByRole[recipient]!.insert(
        0,
        InboxMessage(
          id: _newId('msg'),
          fromRole: _selectedRole,
          toRole: recipient,
          title: normalizedTitle,
          notes: notes.trim(),
          tags: List<String>.from(tags),
          attachments: List<MessageAttachment>.from(attachments),
          createdAt: now,
          actionRequired: actionRequired,
          isRead: false,
        ),
      );
    }
    notifyListeners();
  }

  void startNextWeek() {
    final track = activeTrack;
    final carry = <PlannedAssessmentRequest>[];
    final currentWeekStart = _weekStartByTrack[track]!;
    final nextWeekStart = currentWeekStart.add(const Duration(days: 7));
    final nextWeekEndExclusive = nextWeekStart.add(const Duration(days: 7));

    for (final request in _requestsByTrack[track]!) {
      if (request.completed) {
        continue;
      }
      final existingDate = DateTime.tryParse(request.scheduledDateIso);
      final targetDate =
          existingDate ??
          nextWeekStart.add(Duration(days: request.preferredDay.clamp(0, 4)));
      carry.add(
        PlannedAssessmentRequest(
          id: _newId('req'),
          track: track,
          templateId: request.templateId,
          title: request.title,
          room: request.room,
          category: request.category,
          priority: request.priority,
          estimatedHours: request.estimatedHours,
          preferredDay: request.preferredDay,
          createdAt: DateTime.now(),
          completed: false,
          followUpGenerated: false,
          sendCompletionMessage: request.sendCompletionMessage,
          completionNotifyRole: request.completionNotifyRole,
          completionActionRequiredByDefault:
              request.completionActionRequiredByDefault,
          sendDataToSpecificEmployee: request.sendDataToSpecificEmployee,
          dataRecipientRole: request.dataRecipientRole,
          allowVoiceDictation: request.allowVoiceDictation,
          defaultDataEntryText: request.defaultDataEntryText,
          scheduledDateIso: _isoDate(targetDate),
        ),
      );
    }

    for (final task in _explicitNextByTrack[track]!) {
      final taskDate = DateTime.tryParse(task.scheduledDateIso);
      if (taskDate != null &&
          !taskDate.isBefore(nextWeekStart) &&
          taskDate.isBefore(nextWeekEndExclusive)) {
        carry.add(_taskToRequest(task, track));
      }
    }

    _explicitNextByTrack[track]!.removeWhere((task) {
      final taskDate = DateTime.tryParse(task.scheduledDateIso);
      if (taskDate == null) {
        return false;
      }
      return !taskDate.isBefore(nextWeekStart) &&
          taskDate.isBefore(nextWeekEndExclusive);
    });
    _requestsByTrack[track] = carry;
    _weekStartByTrack[track] = nextWeekStart;
    _notNeededThisWeekByTrack[track]!.clear();
    _closingDoneByTrack[track]!.clear();

    _recomputeTrack(track);
    notifyListeners();
  }

  void moveOneWeekForward() {
    startNextWeek();
  }

  void moveOneWeekBackward() {
    final track = activeTrack;
    final current = _weekStartByTrack[track] ?? _currentWeekStart();
    _weekStartByTrack[track] = current.subtract(const Duration(days: 7));
    _recomputeTrack(track);
    notifyListeners();
  }

  void createTemplate({
    required AssessmentTrack track,
    required String title,
    required String room,
    required String category,
    required int priority,
    required double defaultHours,
    required bool autoFollowUp,
    required String followUpTitle,
    required int followUpPriority,
    required double followUpHours,
    List<FollowUpRule> followUpRules = const [],
    bool sendCompletionMessage = false,
    UserRole completionNotifyRole = UserRole.generalManager,
    bool completionActionRequiredByDefault = true,
    bool sendDataToSpecificEmployee = false,
    UserRole dataRecipientRole = UserRole.producer,
    bool allowVoiceDictation = true,
  }) {
    if (!_selectedRole.canAdmin) {
      return;
    }

    _templates.add(
      AssessmentTemplate(
        id: _newId('tmpl'),
        track: track,
        title: title,
        room: room,
        category: category,
        priority: _clampPriority(priority),
        defaultHours: _clampHours(defaultHours),
        autoFollowUp: autoFollowUp,
        followUpTitle: followUpTitle,
        followUpPriority: _clampPriority(followUpPriority),
        followUpHours: _clampHours(followUpHours),
        followUpRules: followUpRules
            .map(
              (rule) => FollowUpRule(
                title: rule.title.trim(),
                priority: _clampPriority(rule.priority),
                hours: _clampHours(rule.hours),
                assignedRole: rule.assignedRole,
                daysOffset: rule.daysOffset.clamp(0, 70).toInt(),
                weekOffset: rule.weekOffset == 0 ? 0 : 1,
                day: rule.day.clamp(0, 4).toInt(),
                calendarDateIso: rule.calendarDateIso,
                timeMinutes: rule.timeMinutes.clamp(0, (24 * 60) - 1).toInt(),
                sendCompletionMessage: rule.sendCompletionMessage,
                completionNotifyRole: rule.completionNotifyRole,
                defaultDataEntryText: rule.defaultDataEntryText.trim(),
                sendDataToSpecificEmployee: rule.sendDataToSpecificEmployee,
                dataRecipientRole: rule.dataRecipientRole,
                allowVoiceDictation: rule.allowVoiceDictation,
              ),
            )
            .where((rule) => rule.title.isNotEmpty)
            .take(5)
            .toList(),
        sendCompletionMessage: sendCompletionMessage,
        completionNotifyRole: completionNotifyRole,
        completionActionRequiredByDefault: completionActionRequiredByDefault,
        sendDataToSpecificEmployee: sendDataToSpecificEmployee,
        dataRecipientRole: dataRecipientRole,
        allowVoiceDictation: allowVoiceDictation,
      ),
    );
    _sortTemplates();
    _persistTemplates();
    notifyListeners();
  }

  void updateTemplate(AssessmentTemplate updated) {
    if (!_selectedRole.canAdmin) {
      return;
    }

    final index = _templates.indexWhere(
      (template) => template.id == updated.id,
    );
    if (index == -1) {
      return;
    }

    _templates[index] = updated;
    _sortTemplates();
    _persistTemplates();
    notifyListeners();
  }

  Map<String, List<AssessmentTemplate>> templatesByRoomForActiveTrack() {
    final filtered = _templates
        .where((template) => template.track == activeTrack)
        .toList();
    filtered.sort((a, b) {
      final byRoom = _compareRooms(a.room, b.room);
      if (byRoom != 0) {
        return byRoom;
      }
      final byCategory = _compareCategories(a.category, b.category, a.room);
      if (byCategory != 0) {
        return byCategory;
      }
      final byPriority = a.priority.compareTo(b.priority);
      if (byPriority != 0) {
        return byPriority;
      }
      return a.title.compareTo(b.title);
    });

    final grouped = <String, List<AssessmentTemplate>>{};
    for (final template in filtered) {
      grouped
          .putIfAbsent(template.room, () => <AssessmentTemplate>[])
          .add(template);
    }
    return grouped;
  }

  List<AssessmentTemplate> closingTasksForActiveTrack() {
    return _templates
        .where(
          (template) =>
              template.track == activeTrack &&
              template.room == 'OTHER' &&
              template.category == 'Closing Duties',
        )
        .toList()
      ..sort((a, b) => a.title.compareTo(b.title));
  }

  bool isClosingTaskChecked(String templateId) {
    return _closingDoneByTrack[activeTrack]!.contains(templateId);
  }

  void setClosingTaskChecked(String templateId, bool checked) {
    final checkedSet = _closingDoneByTrack[activeTrack]!;
    if (checked) {
      checkedSet.add(templateId);
    } else {
      checkedSet.remove(templateId);
    }
    notifyListeners();
  }

  bool isTemplateNotNeededThisWeek(String templateId) {
    return _notNeededThisWeekByTrack[activeTrack]!.contains(templateId);
  }

  void setTemplateNotNeededThisWeek(String templateId, bool value) {
    final track = activeTrack;
    if (value) {
      _notNeededThisWeekByTrack[track]!.add(templateId);
      _requestsByTrack[track]!.removeWhere(
        (request) =>
            request.templateId == templateId &&
            request.category != 'Auto Follow-up',
      );
      _explicitNextByTrack[track]!.removeWhere(
        (task) =>
            task.sourceTemplateId == templateId &&
            !task.isFollowUp &&
            !task.fromOverflow,
      );
    } else {
      _notNeededThisWeekByTrack[track]!.remove(templateId);
    }
    _recomputeTrack(track);
    notifyListeners();
  }

  bool isSuppliesRequestTemplate(AssessmentTemplate template) {
    final normalizedTitle = template.title.trim().toLowerCase();
    return template.track == AssessmentTrack.producer &&
        normalizedTitle.startsWith('supplies request');
  }

  SuppliesRequestDraft suppliesRequestDraftForTemplate(String templateId) {
    return _suppliesDraftByTemplateId[templateId] ?? const SuppliesRequestDraft();
  }

  void saveSuppliesRequestDraftForTemplate(
    String templateId, {
    required String notes,
    required String neededByIso,
  }) {
    _suppliesDraftByTemplateId[templateId] = SuppliesRequestDraft(
      notes: notes,
      neededByIso: neededByIso,
    );
    _persistSuppliesDrafts();
    notifyListeners();
  }

  List<String> titlesForTrack(AssessmentTrack track, {String? include}) {
    final titles =
        _templates
            .where((template) => template.track == track)
            .map((template) => template.title.trim())
            .where((title) => title.isNotEmpty)
            .toSet()
            .toList()
          ..sort((a, b) => a.toLowerCase().compareTo(b.toLowerCase()));

    final extra = include?.trim() ?? '';
    if (extra.isNotEmpty && !titles.contains(extra)) {
      titles.add(extra);
      titles.sort((a, b) => a.toLowerCase().compareTo(b.toLowerCase()));
    }

    if (titles.isEmpty) {
      titles.add('New Assessment');
    }
    return titles;
  }

  List<String> roomsForTrack(AssessmentTrack track, {String? include}) {
    final rooms =
        _templates
            .where((template) => template.track == track)
            .map((template) => template.room.trim())
            .where((room) => room.isNotEmpty)
            .toSet()
            .toList()
          ..sort((a, b) => a.toLowerCase().compareTo(b.toLowerCase()));

    final extra = include?.trim() ?? '';
    if (extra.isNotEmpty && !rooms.contains(extra)) {
      rooms.add(extra);
    }
    rooms.sort(_compareRooms);

    if (rooms.isEmpty) {
      rooms.add('General');
    }
    return rooms;
  }

  List<String> categoriesForTrack(AssessmentTrack track, {String? include}) {
    final categories =
        _templates
            .where((template) => template.track == track)
            .map((template) => template.category.trim())
            .where((category) => category.isNotEmpty)
            .toSet()
            .toList()
          ..sort((a, b) => a.toLowerCase().compareTo(b.toLowerCase()));

    final extra = include?.trim() ?? '';
    if (extra.isNotEmpty && !categories.contains(extra)) {
      categories.add(extra);
      categories.sort((a, b) => a.toLowerCase().compareTo(b.toLowerCase()));
    }

    if (categories.isEmpty) {
      categories.add('General');
    }
    return categories;
  }

  PlannedAssessmentRequest? findThisWeekRequest(String templateId) {
    final requests =
        _requestsByTrack[activeTrack] ?? const <PlannedAssessmentRequest>[];
    for (final request in requests) {
      if (request.templateId == templateId &&
          request.category != 'Auto Follow-up') {
        return request;
      }
    }
    return null;
  }

  AssessmentTemplate? templateForRequestId(String requestId) {
    final requests =
        _requestsByTrack[activeTrack] ?? const <PlannedAssessmentRequest>[];
    final request = requests.where((item) => item.id == requestId).firstOrNull;
    if (request == null) {
      return null;
    }
    return _templates
        .where((item) => item.id == request.templateId)
        .firstOrNull;
  }

  WeekTask? findExplicitNextWeekTask(String templateId) {
    final nextWeek = _explicitNextByTrack[activeTrack] ?? const <WeekTask>[];
    final weekStart = _weekStartByTrack[activeTrack] ?? _currentWeekStart();
    final nextWeekStart = weekStart.add(const Duration(days: 7));
    final nextWeekEnd = nextWeekStart.add(const Duration(days: 7));
    for (final task in nextWeek) {
      final taskDate = DateTime.tryParse(task.scheduledDateIso);
      final isInNextWeek =
          taskDate != null &&
          !taskDate.isBefore(nextWeekStart) &&
          taskDate.isBefore(nextWeekEnd);
      if (task.sourceTemplateId == templateId &&
          !task.isFollowUp &&
          !task.fromOverflow &&
          isInNextWeek) {
        return task;
      }
    }
    return null;
  }

  PlanAssessmentResult planAssessment({
    required AssessmentTemplate template,
    required double hours,
    required int preferredDay,
    required bool forNextWeek,
  }) {
    final track = activeTrack;
    final normalizedHours = _clampHours(hours);
    final safeDay = preferredDay.clamp(0, 4);
    final weekStart = _weekStartByTrack[track]!;
    final assignmentDate = weekStart.add(
      Duration(days: (forNextWeek ? 7 : 0) + safeDay),
    );
    final suppliesDraft = isSuppliesRequestTemplate(template)
        ? suppliesRequestDraftForTemplate(template.id)
        : const SuppliesRequestDraft();
    final suppliesNotes = suppliesDraft.notes.trim();
    final suppliesNeededBy = suppliesDraft.neededByIso.trim();
    final suppliesEntryText =
        suppliesNeededBy.isEmpty
            ? suppliesNotes
            : '$suppliesNotes\nNeeded by: $suppliesNeededBy';

    var scheduledTaskId = '';
    if (forNextWeek) {
      _requestsByTrack[track]!.removeWhere(
        (request) =>
            request.templateId == template.id &&
            request.category != 'Auto Follow-up',
      );

      final nextList = _explicitNextByTrack[track]!;
      final index = nextList.indexWhere(
        (task) =>
            task.sourceTemplateId == template.id &&
            !task.isFollowUp &&
            !task.fromOverflow,
      );

      final nextTask = WeekTask(
        id: index == -1 ? _newId('next') : nextList[index].id,
        track: track,
        sourceTemplateId: template.id,
        title: template.title,
        room: template.room,
        category: template.category,
        priority: template.priority,
        estimatedHours: normalizedHours,
        day: safeDay,
        completed: false,
        fromOverflow: false,
        isFollowUp: false,
        sendCompletionMessage: template.sendCompletionMessage,
        completionNotifyRole: template.completionNotifyRole,
        completionActionRequiredByDefault:
            template.completionActionRequiredByDefault,
        sendDataToSpecificEmployee: false,
        dataRecipientRole: UserRole.producer,
        allowVoiceDictation: true,
        defaultDataEntryText: suppliesEntryText,
        scheduledDateIso: _isoDate(weekStart.add(Duration(days: 7 + safeDay))),
      );

      if (index == -1) {
        nextList.add(nextTask);
      } else {
        nextList[index] = nextTask;
      }
      scheduledTaskId = nextTask.id;
    } else {
      _explicitNextByTrack[track]!.removeWhere(
        (task) =>
            task.sourceTemplateId == template.id &&
            !task.isFollowUp &&
            !task.fromOverflow,
      );

      final requests = _requestsByTrack[track]!;
      final index = requests.indexWhere(
        (request) =>
            request.templateId == template.id &&
            request.category != 'Auto Follow-up',
      );

      final nextRequest = PlannedAssessmentRequest(
        id: index == -1 ? _newId('req') : requests[index].id,
        track: track,
        templateId: template.id,
        title: template.title,
        room: template.room,
        category: template.category,
        priority: template.priority,
        estimatedHours: normalizedHours,
        preferredDay: safeDay,
        createdAt: index == -1 ? DateTime.now() : requests[index].createdAt,
        completed: index == -1 ? false : requests[index].completed,
        followUpGenerated: index == -1
            ? false
            : requests[index].followUpGenerated,
        sendCompletionMessage: template.sendCompletionMessage,
        completionNotifyRole: template.completionNotifyRole,
        completionActionRequiredByDefault:
            template.completionActionRequiredByDefault,
        sendDataToSpecificEmployee: false,
        dataRecipientRole: UserRole.producer,
        allowVoiceDictation: true,
        defaultDataEntryText: suppliesEntryText,
        scheduledDateIso: _isoDate(weekStart.add(Duration(days: safeDay))),
      );

      if (index == -1) {
        requests.add(nextRequest);
      } else {
        requests[index] = nextRequest;
      }
      scheduledTaskId = nextRequest.id;
    }

    final recomputeTracks = <AssessmentTrack>{track};
    recomputeTracks.addAll(
      _syncAutoPlannedFollowUps(
        template: template,
        assignmentDate: assignmentDate,
      ),
    );
    for (final recomputeTrack in recomputeTracks) {
      _recomputeTrack(recomputeTrack);
    }
    notifyListeners();

    int? assignedDay;
    if (!forNextWeek) {
      final scheduledTask = (_thisWeekByTrack[track] ?? const <WeekTask>[])
          .where((task) => task.id == scheduledTaskId)
          .firstOrNull;
      assignedDay = scheduledTask?.day;
    }
    return PlanAssessmentResult(
      requestedDay: safeDay,
      assignedDay: assignedDay,
    );
  }

  void removePlan(String templateId, {required bool fromNextWeek}) {
    final track = activeTrack;
    final affectedTracks = <AssessmentTrack>{track};

    if (fromNextWeek) {
      _explicitNextByTrack[track]!.removeWhere(
        (task) =>
            task.sourceTemplateId == templateId &&
            !task.isFollowUp &&
            !task.fromOverflow,
      );
    } else {
      _requestsByTrack[track]!.removeWhere(
        (request) =>
            request.templateId == templateId &&
            request.category != 'Auto Follow-up',
      );
    }

    affectedTracks.addAll(_removeAutoPlannedFollowUps(templateId));
    for (final affected in affectedTracks) {
      _recomputeTrack(affected);
    }
    notifyListeners();
  }

  Set<AssessmentTrack> _removeAutoPlannedFollowUps(String templateId) {
    final touched = <AssessmentTrack>{};
    for (final track in AssessmentTrack.values) {
      final requests = _requestsByTrack[track]!;
      final requestBefore = requests.length;
      requests.removeWhere(
        (request) =>
            request.templateId == templateId &&
            request.category == 'Auto Follow-up',
      );
      if (requests.length != requestBefore) {
        touched.add(track);
      }

      final nextTasks = _explicitNextByTrack[track]!;
      final nextBefore = nextTasks.length;
      nextTasks.removeWhere(
        (task) =>
            task.sourceTemplateId == templateId &&
            task.isFollowUp &&
            task.category == 'Auto Follow-up',
      );
      if (nextTasks.length != nextBefore) {
        touched.add(track);
      }
    }
    return touched;
  }

  Set<AssessmentTrack> _syncAutoPlannedFollowUps({
    required AssessmentTemplate template,
    required DateTime assignmentDate,
  }) {
    final touched = _removeAutoPlannedFollowUps(template.id);
    if (!template.autoFollowUp) {
      return touched;
    }

    final followUps = _normalizedFollowUpRules(template);

    for (final rule in followUps) {
      final targetRole = rule.assignedRole;
      final targetTrack = targetRole.defaultTrack;
      touched.add(targetTrack);
      final followUpDate = DateTime(
        assignmentDate.year,
        assignmentDate.month,
        assignmentDate.day,
      ).add(Duration(days: rule.daysOffset.clamp(0, 70)));
      final resolvedDay = _workdayIndex(followUpDate);
      final weekStart = _weekStartByTrack[targetTrack]!;
      final nextWeekStart = weekStart.add(const Duration(days: 7));
      final inCurrentWeek =
          !followUpDate.isBefore(weekStart) &&
          followUpDate.isBefore(nextWeekStart);

      if (inCurrentWeek) {
        _requestsByTrack[targetTrack]!.add(
          PlannedAssessmentRequest(
            id: _newId('req'),
            track: targetTrack,
            templateId: template.id,
            title: rule.title.trim(),
            room: template.room,
            category: 'Auto Follow-up',
            priority: _clampPriority(rule.priority),
            estimatedHours: _clampHours(rule.hours),
            preferredDay: resolvedDay,
            createdAt: DateTime.now(),
            completed: false,
            followUpGenerated: false,
            sendCompletionMessage: rule.sendCompletionMessage,
            completionNotifyRole: rule.completionNotifyRole,
            completionActionRequiredByDefault:
                template.completionActionRequiredByDefault,
            defaultDataEntryText: rule.defaultDataEntryText,
            sendDataToSpecificEmployee: rule.sendDataToSpecificEmployee,
            dataRecipientRole: rule.dataRecipientRole,
            allowVoiceDictation: rule.allowVoiceDictation,
            scheduledDateIso: _isoDate(followUpDate),
          ),
        );
      } else {
        _explicitNextByTrack[targetTrack]!.add(
          WeekTask(
            id: _newId('follow'),
            track: targetTrack,
            sourceTemplateId: template.id,
            title: rule.title.trim(),
            room: template.room,
            category: 'Auto Follow-up',
            priority: _clampPriority(rule.priority),
            estimatedHours: _clampHours(rule.hours),
            day: resolvedDay,
            completed: false,
            fromOverflow: false,
            isFollowUp: true,
            sendCompletionMessage: rule.sendCompletionMessage,
            completionNotifyRole: rule.completionNotifyRole,
            completionActionRequiredByDefault:
                template.completionActionRequiredByDefault,
            defaultDataEntryText: rule.defaultDataEntryText,
            sendDataToSpecificEmployee: rule.sendDataToSpecificEmployee,
            dataRecipientRole: rule.dataRecipientRole,
            allowVoiceDictation: rule.allowVoiceDictation,
            scheduledDateIso: _isoDate(followUpDate),
          ),
        );
      }
    }
    return touched;
  }

  void toggleThisWeekCompletion(String requestId, bool completed) {
    _setTaskCompletion(requestId, completed, dispatch: null);
  }

  void toggleOverflowTaskCompletion(String overflowTaskId, bool completed) {
    final requestId = overflowTaskId.startsWith('overflow-')
        ? overflowTaskId.substring('overflow-'.length)
        : overflowTaskId;
    _setTaskCompletion(requestId, completed, dispatch: null);
  }

  void completeTaskWithDispatch(String requestId, CompletionDispatch dispatch) {
    _setTaskCompletion(requestId, true, dispatch: dispatch);
  }

  void _setTaskCompletion(
    String requestId,
    bool completed, {
    CompletionDispatch? dispatch,
  }) {
    final track = activeTrack;
    final recomputeTracks = <AssessmentTrack>{track};
    final requests = _requestsByTrack[track]!;
    final index = requests.indexWhere((request) => request.id == requestId);

    if (index == -1) {
      return;
    }

    var request = requests[index];
    request = request.copyWith(completed: completed);

    if (completed && !request.followUpGenerated) {
      final template = _templates
          .where((item) => item.id == request.templateId)
          .firstOrNull;
      if (template != null && template.autoFollowUp) {
        final followUps = _normalizedFollowUpRules(template);

        for (final rule in followUps) {
          final targetRole = rule.assignedRole;
          final targetTrack = targetRole.defaultTrack;
          recomputeTracks.add(targetTrack);
          final baseDate = DateTime.now().add(
            Duration(days: rule.daysOffset.clamp(0, 70)),
          );
          final parsedDate = DateTime.tryParse(rule.calendarDateIso);
          final useDynamicOffset = rule.daysOffset >= 0;
          final followUpDate = DateTime(
            (useDynamicOffset ? baseDate : (parsedDate ?? baseDate)).year,
            (useDynamicOffset ? baseDate : (parsedDate ?? baseDate)).month,
            (useDynamicOffset ? baseDate : (parsedDate ?? baseDate)).day,
          );
          final resolvedDay = _workdayIndex(followUpDate);
          final weekStart = _weekStartByTrack[targetTrack]!;
          final nextWeekStart = weekStart.add(const Duration(days: 7));
          final inCurrentWeek =
              !followUpDate.isBefore(weekStart) &&
              followUpDate.isBefore(nextWeekStart);
          if (inCurrentWeek) {
            _requestsByTrack[targetTrack]!.add(
              PlannedAssessmentRequest(
                id: _newId('req'),
                track: targetTrack,
                templateId: template.id,
                title: rule.title.trim(),
                room: template.room,
                category: template.category,
                priority: _clampPriority(rule.priority),
                estimatedHours: _clampHours(rule.hours),
                preferredDay: resolvedDay,
                createdAt: DateTime.now(),
                completed: false,
                followUpGenerated: false,
                sendCompletionMessage: rule.sendCompletionMessage,
                completionNotifyRole: rule.completionNotifyRole,
                completionActionRequiredByDefault:
                    template.completionActionRequiredByDefault,
                defaultDataEntryText: rule.defaultDataEntryText,
                sendDataToSpecificEmployee: rule.sendDataToSpecificEmployee,
                dataRecipientRole: rule.dataRecipientRole,
                allowVoiceDictation: rule.allowVoiceDictation,
                scheduledDateIso: _isoDate(followUpDate),
              ),
            );
          } else {
            _explicitNextByTrack[targetTrack]!.add(
              WeekTask(
                id: _newId('follow'),
                track: targetTrack,
                sourceTemplateId: template.id,
                title: rule.title.trim(),
                room: template.room,
                category: template.category,
                priority: _clampPriority(rule.priority),
                estimatedHours: _clampHours(rule.hours),
                day: resolvedDay,
                completed: false,
                fromOverflow: false,
                isFollowUp: true,
                sendCompletionMessage: rule.sendCompletionMessage,
                completionNotifyRole: rule.completionNotifyRole,
                completionActionRequiredByDefault:
                    template.completionActionRequiredByDefault,
                defaultDataEntryText: rule.defaultDataEntryText,
                sendDataToSpecificEmployee: rule.sendDataToSpecificEmployee,
                dataRecipientRole: rule.dataRecipientRole,
                allowVoiceDictation: rule.allowVoiceDictation,
                scheduledDateIso: _isoDate(followUpDate),
              ),
            );
          }
        }
        request = request.copyWith(followUpGenerated: true);
      }
    }

    if (completed && dispatch != null && dispatch.recipients.isNotEmpty) {
      for (final recipient in dispatch.recipients) {
        _inboxByRole[recipient]!.insert(
          0,
          InboxMessage(
            id: _newId('msg'),
            fromRole: _selectedRole,
            toRole: recipient,
            title: 'Completed: ${request.title}',
            notes: dispatch.notes,
            tags: dispatch.tags,
            attachments: dispatch.attachments,
            createdAt: DateTime.now(),
            actionRequired: dispatch.actionRequired,
            isRead: false,
          ),
        );

        if (dispatch.actionRequired) {
          final recipientTrack = recipient.defaultTrack;
          recomputeTracks.add(recipientTrack);
          _requestsByTrack[recipientTrack]!.add(
            PlannedAssessmentRequest(
              id: _newId('req'),
              track: recipientTrack,
              templateId: request.templateId,
              title: 'Action required (${recipient.label}): ${request.title}',
              room: request.room,
              category: 'Inbox Action',
              priority: request.priority,
              estimatedHours: 1.0,
              preferredDay: 0,
              createdAt: DateTime.now(),
              completed: false,
              followUpGenerated: false,
              sendCompletionMessage: false,
              completionNotifyRole: recipient,
              completionActionRequiredByDefault: true,
              sendDataToSpecificEmployee: false,
              dataRecipientRole: recipient,
              allowVoiceDictation: true,
              defaultDataEntryText: '',
              scheduledDateIso: _isoDate(DateTime.now()),
            ),
          );
        }
      }
    }

    requests[index] = request;
    for (final recomputeTrack in recomputeTracks) {
      _recomputeTrack(recomputeTrack);
    }
    notifyListeners();
  }

  double dayLoad(int dayIndex) {
    return _dailyLoadsByTrack[activeTrack]?[dayIndex] ?? 0.0;
  }

  List<WeekTask> tasksForDay(int dayIndex) {
    final tasks = _thisWeekByTrack[activeTrack] ?? const <WeekTask>[];
    return tasks.where((task) => task.day == dayIndex).toList()..sort((a, b) {
      final byPriority = a.priority.compareTo(b.priority);
      if (byPriority != 0) {
        return byPriority;
      }
      return a.title.compareTo(b.title);
    });
  }

  void _recomputeTrack(AssessmentTrack track) {
    final requests = [
      ...(_requestsByTrack[track] ?? const <PlannedAssessmentRequest>[]),
    ];
    requests.sort((a, b) {
      final byPriority = a.priority.compareTo(b.priority);
      if (byPriority != 0) {
        return byPriority;
      }
      return a.createdAt.compareTo(b.createdAt);
    });

    final schedule = <WeekTask>[];
    final overflow = <WeekTask>[];
    final dayLoads = {for (var i = 0; i < 5; i++) i: 0.0};

    var weekLoad = 0.0;

    for (final request in requests) {
      if (weekLoad + request.estimatedHours > weekHourLimit) {
        overflow.add(
          WeekTask(
            id: 'overflow-${request.id}',
            track: track,
            sourceTemplateId: request.templateId,
            title: request.title,
            room: request.room,
            category: request.category,
            priority: request.priority,
            estimatedHours: request.estimatedHours,
            day: null,
            completed: request.completed,
            fromOverflow: true,
            isFollowUp: false,
            sendCompletionMessage: request.sendCompletionMessage,
            completionNotifyRole: request.completionNotifyRole,
            completionActionRequiredByDefault:
                request.completionActionRequiredByDefault,
            sendDataToSpecificEmployee: request.sendDataToSpecificEmployee,
            dataRecipientRole: request.dataRecipientRole,
            allowVoiceDictation: request.allowVoiceDictation,
            defaultDataEntryText: request.defaultDataEntryText,
            scheduledDateIso: request.scheduledDateIso,
          ),
        );
        continue;
      }

      final assignedDay = _findDayWithCapacity(
        request.preferredDay,
        request.estimatedHours,
        dayLoads,
      );
      if (assignedDay == null) {
        overflow.add(
          WeekTask(
            id: 'overflow-${request.id}',
            track: track,
            sourceTemplateId: request.templateId,
            title: request.title,
            room: request.room,
            category: request.category,
            priority: request.priority,
            estimatedHours: request.estimatedHours,
            day: null,
            completed: request.completed,
            fromOverflow: true,
            isFollowUp: false,
            sendCompletionMessage: request.sendCompletionMessage,
            completionNotifyRole: request.completionNotifyRole,
            completionActionRequiredByDefault:
                request.completionActionRequiredByDefault,
            sendDataToSpecificEmployee: request.sendDataToSpecificEmployee,
            dataRecipientRole: request.dataRecipientRole,
            allowVoiceDictation: request.allowVoiceDictation,
            defaultDataEntryText: request.defaultDataEntryText,
            scheduledDateIso: request.scheduledDateIso,
          ),
        );
        continue;
      }

      dayLoads[assignedDay] = dayLoads[assignedDay]! + request.estimatedHours;
      weekLoad += request.estimatedHours;

      schedule.add(
        WeekTask(
          id: request.id,
          track: track,
          sourceTemplateId: request.templateId,
          title: request.title,
          room: request.room,
          category: request.category,
          priority: request.priority,
          estimatedHours: request.estimatedHours,
          day: assignedDay,
          completed: request.completed,
          fromOverflow: false,
          isFollowUp: false,
          sendCompletionMessage: request.sendCompletionMessage,
          completionNotifyRole: request.completionNotifyRole,
          completionActionRequiredByDefault:
              request.completionActionRequiredByDefault,
          sendDataToSpecificEmployee: request.sendDataToSpecificEmployee,
          dataRecipientRole: request.dataRecipientRole,
          allowVoiceDictation: request.allowVoiceDictation,
          defaultDataEntryText: request.defaultDataEntryText,
          scheduledDateIso: request.scheduledDateIso,
        ),
      );
    }

    _thisWeekByTrack[track] = schedule;
    _overflowByTrack[track] = overflow;
    _dailyLoadsByTrack[track] = dayLoads;
    _weekLoadByTrack[track] = weekLoad;
  }

  int? _findDayWithCapacity(
    int preferredDay,
    double hours,
    Map<int, double> dayLoads,
  ) {
    for (var day = preferredDay; day < 5; day++) {
      if ((dayLoads[day] ?? 0) + hours <= dayHourLimit) {
        return day;
      }
    }
    return null;
  }

  int _clampPriority(int value) {
    if (value < 1) {
      return 1;
    }
    if (value > 5) {
      return 5;
    }
    return value;
  }

  double _clampHours(double value) {
    final options = AppController.hourStepOptions();
    if (value <= options.first) {
      return options.first;
    }
    if (value >= options.last) {
      return options.last;
    }
    var best = options.first;
    var bestDistance = (value - best).abs();
    for (final option in options.skip(1)) {
      final distance = (value - option).abs();
      if (distance < bestDistance) {
        best = option;
        bestDistance = distance;
      }
    }
    return best;
  }

  List<FollowUpRule> _normalizedFollowUpRules(AssessmentTemplate template) {
    final source = template.followUpRules.isNotEmpty
        ? template.followUpRules
        : (template.followUpTitle.trim().isNotEmpty
              ? [
                  FollowUpRule(
                    title: template.followUpTitle.trim(),
                    priority: template.followUpPriority,
                    hours: template.followUpHours,
                    weekOffset: 1,
                    day: 0,
                  ),
                ]
              : const <FollowUpRule>[]);
    final seen = <String>{};
    final unique = <FollowUpRule>[];
    for (final rule in source) {
      final title = rule.title.trim();
      if (title.isEmpty) {
        continue;
      }
      final normalized = FollowUpRule(
        title: title,
        priority: _clampPriority(rule.priority),
        hours: _clampHours(rule.hours),
        assignedRole: rule.assignedRole,
        daysOffset: rule.daysOffset.clamp(0, 70).toInt(),
        weekOffset: rule.weekOffset == 0 ? 0 : 1,
        day: rule.day.clamp(0, 4).toInt(),
        calendarDateIso: rule.calendarDateIso.trim(),
        timeMinutes: rule.timeMinutes.clamp(0, (24 * 60) - 1).toInt(),
        sendCompletionMessage: rule.sendCompletionMessage,
        completionNotifyRole: rule.completionNotifyRole,
        defaultDataEntryText: rule.defaultDataEntryText.trim(),
        sendDataToSpecificEmployee: rule.sendDataToSpecificEmployee,
        dataRecipientRole: rule.dataRecipientRole,
        allowVoiceDictation: rule.allowVoiceDictation,
      );
      final key =
          '${normalized.title.toLowerCase()}|${normalized.assignedRole.name}|'
          '${normalized.priority}|${normalized.hours.toStringAsFixed(4)}|'
          '${normalized.daysOffset}|${normalized.weekOffset}|${normalized.day}|'
          '${normalized.calendarDateIso}|${normalized.timeMinutes}|'
          '${normalized.sendCompletionMessage}|${normalized.completionNotifyRole.name}|'
          '${normalized.defaultDataEntryText.toLowerCase()}|'
          '${normalized.sendDataToSpecificEmployee}|'
          '${normalized.dataRecipientRole.name}|${normalized.allowVoiceDictation}';
      if (seen.add(key)) {
        unique.add(normalized);
      }
    }
    return unique.take(5).toList();
  }

  void _removeObsoleteSuppliesPrompts() {
    bool shouldRemove(AssessmentTemplate template) {
      if (template.track != AssessmentTrack.producer) {
        return false;
      }
      final normalizedTitle = template.title.trim().toLowerCase();
      return normalizedTitle == 'what supplies do you need?' ||
          normalizedTitle == 'what supplies do you need' ||
          normalizedTitle == 'when do you need the supplies to arrive?' ||
          normalizedTitle == 'when do you need the supplies to arrive' ||
          normalizedTitle == 'when do you need the supplies to arrive buy';
    }

    var changed = false;
    final before = _templates.length;
    _templates.removeWhere(shouldRemove);
    if (_templates.length != before) {
      changed = true;
    }
    for (var i = 0; i < _templates.length; i++) {
      final template = _templates[i];
      if (template.track != AssessmentTrack.producer) {
        continue;
      }
      final normalizedTitle = template.title.trim().toLowerCase();
      if (normalizedTitle ==
          'supplies request (include each supply and date needed by)') {
        _templates[i] = template.copyWith(title: 'Supplies request');
        changed = true;
      }
    }
    if (changed) {
      _sortTemplates();
      _persistTemplates();
    }
  }

  Future<void> _loadSuppliesDraftsFromStorage() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final raw = prefs.getString(_suppliesDraftStorageKey);
      if (raw == null || raw.trim().isEmpty) {
        return;
      }
      final decoded = jsonDecode(raw);
      if (decoded is! Map) {
        return;
      }
      final loaded = <String, SuppliesRequestDraft>{};
      for (final entry in decoded.entries) {
        final key = entry.key.toString().trim();
        if (key.isEmpty || entry.value is! Map) {
          continue;
        }
        final value = (entry.value as Map).cast<dynamic, dynamic>();
        loaded[key] = SuppliesRequestDraft(
          notes: (value['notes'] ?? '').toString(),
          neededByIso: (value['neededByIso'] ?? '').toString(),
        );
      }
      _suppliesDraftByTemplateId
        ..clear()
        ..addAll(loaded);
    } catch (_) {
      // Ignore malformed local drafts.
    }
  }

  void _persistSuppliesDrafts() {
    final payload = <String, Map<String, String>>{};
    for (final entry in _suppliesDraftByTemplateId.entries) {
      payload[entry.key] = {
        'notes': entry.value.notes,
        'neededByIso': entry.value.neededByIso,
      };
    }
    final encoded = jsonEncode(payload);
    SharedPreferences.getInstance().then((prefs) {
      prefs.setString(_suppliesDraftStorageKey, encoded);
    }).catchError((_) {
      // Ignore persistence failures; app should still work in-memory.
    });
  }

  Future<bool> _loadTemplatesFromStorage() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final raw = prefs.getString(_templatesStorageKey);
      if (raw == null || raw.trim().isEmpty) {
        return false;
      }
      final decoded = jsonDecode(raw);
      if (decoded is! List) {
        return false;
      }
      final restored = <AssessmentTemplate>[];
      for (final entry in decoded) {
        final template = _templateFromJson(entry);
        if (template != null) {
          restored.add(template);
        }
      }
      if (restored.isEmpty) {
        return false;
      }
      _templates
        ..clear()
        ..addAll(restored);
      _syncIdCounterFromExistingIds();
      return true;
    } catch (_) {
      return false;
    }
  }

  void _persistTemplates() {
    final payload = _templates.map(_templateToJson).toList();
    final encoded = jsonEncode(payload);
    SharedPreferences.getInstance().then((prefs) {
      prefs.setString(_templatesStorageKey, encoded);
    }).catchError((_) {
      // Ignore persistence failures; app should still work in-memory.
    });
  }

  Map<String, dynamic> _templateToJson(AssessmentTemplate template) {
    return {
      'id': template.id,
      'track': template.track.name,
      'title': template.title,
      'room': template.room,
      'category': template.category,
      'priority': template.priority,
      'defaultHours': template.defaultHours,
      'autoFollowUp': template.autoFollowUp,
      'followUpTitle': template.followUpTitle,
      'followUpPriority': template.followUpPriority,
      'followUpHours': template.followUpHours,
      'followUpRules': template.followUpRules
          .map(
            (rule) => {
              'title': rule.title,
              'priority': rule.priority,
              'hours': rule.hours,
              'assignedRole': rule.assignedRole.name,
              'daysOffset': rule.daysOffset,
              'weekOffset': rule.weekOffset,
              'day': rule.day,
              'calendarDateIso': rule.calendarDateIso,
              'timeMinutes': rule.timeMinutes,
              'sendCompletionMessage': rule.sendCompletionMessage,
              'completionNotifyRole': rule.completionNotifyRole.name,
              'defaultDataEntryText': rule.defaultDataEntryText,
              'sendDataToSpecificEmployee': rule.sendDataToSpecificEmployee,
              'dataRecipientRole': rule.dataRecipientRole.name,
              'allowVoiceDictation': rule.allowVoiceDictation,
            },
          )
          .toList(),
      'sendCompletionMessage': template.sendCompletionMessage,
      'completionNotifyRole': template.completionNotifyRole.name,
      'completionActionRequiredByDefault':
          template.completionActionRequiredByDefault,
      'sendDataToSpecificEmployee': template.sendDataToSpecificEmployee,
      'dataRecipientRole': template.dataRecipientRole.name,
      'allowVoiceDictation': template.allowVoiceDictation,
    };
  }

  AssessmentTemplate? _templateFromJson(dynamic raw) {
    if (raw is! Map) {
      return null;
    }
    final map = raw.cast<dynamic, dynamic>();
    final id = (map['id'] ?? '').toString().trim();
    final title = (map['title'] ?? '').toString().trim();
    final room = (map['room'] ?? '').toString().trim();
    final category = (map['category'] ?? '').toString().trim();
    if (id.isEmpty || title.isEmpty || room.isEmpty || category.isEmpty) {
      return null;
    }
    final track = _trackFromName((map['track'] ?? '').toString());
    if (track == null) {
      return null;
    }

    final followUpRulesRaw = map['followUpRules'];
    final followUpRules = <FollowUpRule>[];
    if (followUpRulesRaw is List) {
      for (final item in followUpRulesRaw) {
        if (item is! Map) {
          continue;
        }
        final itemMap = item.cast<dynamic, dynamic>();
        final ruleTitle = (itemMap['title'] ?? '').toString().trim();
        if (ruleTitle.isEmpty) {
          continue;
        }
        followUpRules.add(
          FollowUpRule(
            title: ruleTitle,
            priority: _clampPriority((itemMap['priority'] as num?)?.toInt() ?? 3),
            hours: _clampHours((itemMap['hours'] as num?)?.toDouble() ?? 1.0),
            assignedRole:
                _roleFromName((itemMap['assignedRole'] ?? '').toString()) ??
                UserRole.producer,
            daysOffset: ((itemMap['daysOffset'] as num?)?.toInt() ?? 0)
                .clamp(0, 70)
                .toInt(),
            weekOffset:
                (((itemMap['weekOffset'] as num?)?.toInt() ?? 1) == 0 ? 0 : 1),
            day: ((itemMap['day'] as num?)?.toInt() ?? 0).clamp(0, 4).toInt(),
            calendarDateIso: (itemMap['calendarDateIso'] ?? '').toString(),
            timeMinutes: ((itemMap['timeMinutes'] as num?)?.toInt() ?? (9 * 60))
                .clamp(0, (24 * 60) - 1)
                .toInt(),
            sendCompletionMessage:
                (itemMap['sendCompletionMessage'] as bool?) ?? false,
            completionNotifyRole:
                _roleFromName((itemMap['completionNotifyRole'] ?? '').toString()) ??
                UserRole.generalManager,
            defaultDataEntryText:
                (itemMap['defaultDataEntryText'] ?? '').toString(),
            sendDataToSpecificEmployee:
                (itemMap['sendDataToSpecificEmployee'] as bool?) ?? false,
            dataRecipientRole:
                _roleFromName((itemMap['dataRecipientRole'] ?? '').toString()) ??
                UserRole.producer,
            allowVoiceDictation:
                (itemMap['allowVoiceDictation'] as bool?) ?? true,
          ),
        );
      }
    }

    return AssessmentTemplate(
      id: id,
      track: track,
      title: title,
      room: room,
      category: category,
      priority: _clampPriority((map['priority'] as num?)?.toInt() ?? 3),
      defaultHours: _clampHours((map['defaultHours'] as num?)?.toDouble() ?? 1.0),
      autoFollowUp: (map['autoFollowUp'] as bool?) ?? false,
      followUpTitle: (map['followUpTitle'] ?? '').toString(),
      followUpPriority: _clampPriority((map['followUpPriority'] as num?)?.toInt() ?? 3),
      followUpHours: _clampHours((map['followUpHours'] as num?)?.toDouble() ?? 1.0),
      followUpRules: followUpRules.take(5).toList(),
      sendCompletionMessage: (map['sendCompletionMessage'] as bool?) ?? false,
      completionNotifyRole:
          _roleFromName((map['completionNotifyRole'] ?? '').toString()) ??
          UserRole.generalManager,
      completionActionRequiredByDefault:
          (map['completionActionRequiredByDefault'] as bool?) ?? true,
      sendDataToSpecificEmployee:
          (map['sendDataToSpecificEmployee'] as bool?) ?? false,
      dataRecipientRole:
          _roleFromName((map['dataRecipientRole'] ?? '').toString()) ??
          UserRole.producer,
      allowVoiceDictation: (map['allowVoiceDictation'] as bool?) ?? true,
    );
  }

  AssessmentTrack? _trackFromName(String value) {
    for (final track in AssessmentTrack.values) {
      if (track.name == value) {
        return track;
      }
    }
    return null;
  }

  UserRole? _roleFromName(String value) {
    for (final role in UserRole.values) {
      if (role.name == value) {
        return role;
      }
    }
    return null;
  }

  void _syncIdCounterFromExistingIds() {
    var maxId = 0;
    for (final template in _templates) {
      final match = RegExp(r'-(\d+)$').firstMatch(template.id);
      final value = int.tryParse(match?.group(1) ?? '');
      if (value != null && value > maxId) {
        maxId = value;
      }
    }
    if (maxId + 1 > _idCounter) {
      _idCounter = maxId + 1;
    }
  }

  int _workdayIndex(DateTime date) {
    final candidate = date.weekday - DateTime.monday;
    if (candidate < 0) {
      return 0;
    }
    if (candidate > 4) {
      return 4;
    }
    return candidate;
  }

  String _newId(String prefix) {
    final next = _idCounter;
    _idCounter += 1;
    return '$prefix-$next';
  }

  PlannedAssessmentRequest _taskToRequest(
    WeekTask task,
    AssessmentTrack track,
  ) {
    final targetDate = task.scheduledDateIso.trim().isNotEmpty
        ? task.scheduledDateIso
        : _isoDate(
            (_weekStartByTrack[track] ?? _currentWeekStart()).add(
              Duration(days: (task.day ?? 0).clamp(0, 4).toInt()),
            ),
          );
    return PlannedAssessmentRequest(
      id: _newId('req'),
      track: track,
      templateId: task.sourceTemplateId,
      title: task.title,
      room: task.room,
      category: task.category,
      priority: task.priority,
      estimatedHours: task.estimatedHours,
      preferredDay: (task.day ?? 0).clamp(0, 4).toInt(),
      createdAt: DateTime.now(),
      completed: false,
      followUpGenerated: false,
      sendCompletionMessage: task.sendCompletionMessage,
      completionNotifyRole: task.completionNotifyRole,
      completionActionRequiredByDefault:
          task.completionActionRequiredByDefault,
      sendDataToSpecificEmployee: task.sendDataToSpecificEmployee,
      dataRecipientRole: task.dataRecipientRole,
      allowVoiceDictation: task.allowVoiceDictation,
      defaultDataEntryText: task.defaultDataEntryText,
      scheduledDateIso: targetDate,
    );
  }

  String _formatDate(DateTime value) {
    return '${_monthNames[value.month - 1]} ${value.day}, ${value.year}';
  }

  String _isoDate(DateTime date) {
    final year = date.year.toString().padLeft(4, '0');
    final month = date.month.toString().padLeft(2, '0');
    final day = date.day.toString().padLeft(2, '0');
    return '$year-$month-$day';
  }

  static DateTime _currentWeekStart() {
    final now = DateTime.now();
    final monday = now.subtract(Duration(days: now.weekday - DateTime.monday));
    return DateTime(monday.year, monday.month, monday.day);
  }

  void _sortTemplates() {
    _templates.sort((a, b) {
      final byTrack = a.track.index.compareTo(b.track.index);
      if (byTrack != 0) {
        return byTrack;
      }
      final byRoom = _compareRooms(a.room, b.room);
      if (byRoom != 0) {
        return byRoom;
      }
      final byPriority = a.priority.compareTo(b.priority);
      if (byPriority != 0) {
        return byPriority;
      }
      return a.title.compareTo(b.title);
    });
  }

  int _compareRooms(String a, String b) {
    final ai = _roomSortIndex(a);
    final bi = _roomSortIndex(b);
    if (ai != bi) {
      return ai.compareTo(bi);
    }
    return a.toLowerCase().compareTo(b.toLowerCase());
  }

  int _roomSortIndex(String room) {
    final normalized = room.toLowerCase().replaceAll(':', '').trim();
    if (normalized.startsWith('veg room')) {
      return 0;
    }
    if (normalized.startsWith('flower room')) {
      return 1;
    }
    if (normalized.startsWith('drying room')) {
      return 2;
    }
    if (normalized.startsWith('west room')) {
      return 3;
    }
    if (normalized == 'other') {
      return 4;
    }
    return 99;
  }

  String displayCategoryName(String category) {
    final normalized = category.trim().toLowerCase();
    if (normalized == 'mothers inspection') {
      return 'Mothers';
    }
    if (normalized == '2 gal plants' || normalized == '2 gallon plants') {
      return '2 Gallons';
    }
    return category;
  }

  int _compareCategories(String a, String b, String room) {
    final ai = _categorySortIndex(a, room);
    final bi = _categorySortIndex(b, room);
    if (ai != bi) {
      return ai.compareTo(bi);
    }
    final an = displayCategoryName(a).toLowerCase();
    final bn = displayCategoryName(b).toLowerCase();
    return an.compareTo(bn);
  }

  int _categorySortIndex(String category, String room) {
    final normalizedRoom = room.toLowerCase().replaceAll(':', '').trim();
    final normalizedCategory = category.toLowerCase().trim();
    if (normalizedRoom.startsWith('veg room')) {
      if (normalizedCategory == 'mothers inspection' ||
          normalizedCategory == 'mothers') {
        return 0;
      }
      if (normalizedCategory == '2 gal plants' ||
          normalizedCategory == '2 gallon plants' ||
          normalizedCategory == '2 gallons') {
        return 1;
      }
      if (normalizedCategory == 'clones') {
        return 2;
      }
    }
    return 99;
  }
}

extension FirstOrNullX<E> on Iterable<E> {
  E? get firstOrNull {
    final iterator = this.iterator;
    if (!iterator.moveNext()) {
      return null;
    }
    return iterator.current;
  }
}
