/** @type {import('@bacons/apple-targets').Config} */
module.exports = {
  type: 'widget',
  name: 'CoupleWidget',
  bundleIdentifier: '.widget',
  deploymentTarget: '16.0',
  frameworks: ['WidgetKit', 'SwiftUI'],
  entitlements: {
    'com.apple.security.application-groups': ['group.com.couplebuzz.app'],
  },
};
