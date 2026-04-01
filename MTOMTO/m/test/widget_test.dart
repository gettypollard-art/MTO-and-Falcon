import 'package:flutter_test/flutter_test.dart';

import 'package:m/main.dart';

void main() {
  testWidgets('App renders shell', (WidgetTester tester) async {
    final controller = AppController();
    await tester.pumpWidget(MApp(controller: controller));

    expect(find.text('M'), findsOneWidget);
  });
}
