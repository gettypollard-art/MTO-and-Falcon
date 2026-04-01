import 'package:flutter_test/flutter_test.dart';
import 'package:m/main.dart';

void main() {
  group('AppController workflow checks', () {
    test('CEO can create assessments', () {
      final controller = AppController();

      controller.createTemplate(
        track: AssessmentTrack.producer,
        title: 'New CEO Assessment',
        room: 'VEG ROOM',
        category: 'Custom',
        priority: 2,
        defaultHours: 1.5,
        autoFollowUp: false,
        followUpTitle: '',
        followUpPriority: 3,
        followUpHours: 1.0,
      );

      final templates = controller
          .templatesByRoomForActiveTrack()
          .values
          .expand((items) => items)
          .toList();

      expect(
        templates.any((template) => template.title == 'New CEO Assessment'),
        isTrue,
      );
    });

    test('Producer scheduling honors priority and day capacity', () {
      final controller = AppController();

      controller.createTemplate(
        track: AssessmentTrack.producer,
        title: 'Priority 2 Task',
        room: 'VEG ROOM',
        category: 'Test',
        priority: 2,
        defaultHours: 2.0,
        autoFollowUp: false,
        followUpTitle: '',
        followUpPriority: 3,
        followUpHours: 1.0,
      );
      controller.createTemplate(
        track: AssessmentTrack.producer,
        title: 'Priority 1 Task',
        room: 'VEG ROOM',
        category: 'Test',
        priority: 1,
        defaultHours: 2.0,
        autoFollowUp: false,
        followUpTitle: '',
        followUpPriority: 3,
        followUpHours: 1.0,
      );
      controller.createTemplate(
        track: AssessmentTrack.producer,
        title: 'Large Task',
        room: 'VEG ROOM',
        category: 'Test',
        priority: 3,
        defaultHours: 7.0,
        autoFollowUp: false,
        followUpTitle: '',
        followUpPriority: 3,
        followUpHours: 1.0,
      );

      final templates = controller
          .templatesByRoomForActiveTrack()
          .values
          .expand((items) => items)
          .toList();
      final p2 = templates.firstWhere(
        (template) => template.title == 'Priority 2 Task',
      );
      final p1 = templates.firstWhere(
        (template) => template.title == 'Priority 1 Task',
      );
      final large = templates.firstWhere(
        (template) => template.title == 'Large Task',
      );

      controller.planAssessment(
        template: p2,
        hours: 2.0,
        preferredDay: 0,
        forNextWeek: false,
      );
      controller.planAssessment(
        template: p1,
        hours: 2.0,
        preferredDay: 0,
        forNextWeek: false,
      );
      controller.planAssessment(
        template: large,
        hours: 7.0,
        preferredDay: 0,
        forNextWeek: false,
      );

      final mondayTasks = controller.tasksForDay(0);
      final tuesdayTasks = controller.tasksForDay(1);

      expect(mondayTasks.length, 2);
      expect(mondayTasks.first.title, 'Priority 1 Task');
      expect(mondayTasks.last.title, 'Priority 2 Task');
      expect(controller.dayLoad(0), 4.0);
      expect(tuesdayTasks.any((task) => task.title == 'Large Task'), isTrue);
      expect(controller.dayLoad(1), 7.0);
      expect(controller.weekLoad, 11.0);
    });

    test('Assessments beyond 40 hours go to overflow', () {
      final controller = AppController();

      final templates = <AssessmentTemplate>[];
      for (var i = 0; i < 21; i++) {
        controller.createTemplate(
          track: AssessmentTrack.producer,
          title: 'Task $i',
          room: 'FLOWER ROOM',
          category: 'Load',
          priority: 1,
          defaultHours: 2.0,
          autoFollowUp: false,
          followUpTitle: '',
          followUpPriority: 3,
          followUpHours: 1.0,
        );
      }

      templates.addAll(
        controller.templatesByRoomForActiveTrack().values.expand(
          (items) => items,
        ),
      );

      for (final template in templates) {
        controller.planAssessment(
          template: template,
          hours: 2.0,
          preferredDay: 0,
          forNextWeek: false,
        );
      }

      expect(controller.weekLoad, 40.0);
      expect(controller.overflowTasks.length, 1);
      expect(controller.thisWeekSchedule.length, 20);
    });

    test('Start next week carries unfinished and next-week tasks forward', () {
      final controller = AppController();
      final previousLabel = controller.weekLabel;

      controller.createTemplate(
        track: AssessmentTrack.producer,
        title: 'Primary Task',
        room: 'OTHER',
        category: 'Week',
        priority: 1,
        defaultHours: 2.0,
        autoFollowUp: true,
        followUpTitle: 'Primary Follow-up',
        followUpPriority: 2,
        followUpHours: 1.0,
      );
      controller.createTemplate(
        track: AssessmentTrack.producer,
        title: 'Unfinished Task',
        room: 'OTHER',
        category: 'Week',
        priority: 2,
        defaultHours: 2.0,
        autoFollowUp: false,
        followUpTitle: '',
        followUpPriority: 3,
        followUpHours: 1.0,
      );
      controller.createTemplate(
        track: AssessmentTrack.producer,
        title: 'Explicit Next Week Task',
        room: 'OTHER',
        category: 'Week',
        priority: 3,
        defaultHours: 2.0,
        autoFollowUp: false,
        followUpTitle: '',
        followUpPriority: 3,
        followUpHours: 1.0,
      );

      final templates = controller
          .templatesByRoomForActiveTrack()
          .values
          .expand((items) => items)
          .toList();
      final primary = templates.firstWhere(
        (template) => template.title == 'Primary Task',
      );
      final unfinished = templates.firstWhere(
        (template) => template.title == 'Unfinished Task',
      );
      final explicitNext = templates.firstWhere(
        (template) => template.title == 'Explicit Next Week Task',
      );

      controller.planAssessment(
        template: primary,
        hours: 2.0,
        preferredDay: 0,
        forNextWeek: false,
      );
      controller.planAssessment(
        template: unfinished,
        hours: 2.0,
        preferredDay: 1,
        forNextWeek: false,
      );
      controller.planAssessment(
        template: explicitNext,
        hours: 2.0,
        preferredDay: 2,
        forNextWeek: true,
      );

      final primaryRequest = controller.findThisWeekRequest(primary.id)!;
      controller.toggleThisWeekCompletion(primaryRequest.id, true);

      controller.startNextWeek();

      final thisWeekTitles = controller.thisWeekSchedule
          .map((task) => task.title)
          .toList();

      expect(controller.weekLabel, isNot(previousLabel));
      expect(thisWeekTitles.contains('Primary Task'), isFalse);
      expect(thisWeekTitles.contains('Unfinished Task'), isTrue);
      expect(thisWeekTitles.contains('Explicit Next Week Task'), isTrue);
      expect(
        thisWeekTitles.any((title) => title.startsWith('Primary Follow-up')),
        isTrue,
      );
    });
  });
}
