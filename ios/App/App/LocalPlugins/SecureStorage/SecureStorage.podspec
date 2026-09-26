Pod::Spec.new do |s|
  s.name             = 'SecureStorage'
  s.version          = '0.0.1'
  s.summary          = 'Local Keychain-backed secure storage plugin for Octane.'
  s.description      = <<-DESC
                       A tiny Capacitor plugin that persists string values in the iOS Keychain
                       so sensitive app state is encrypted at rest instead of sitting in the
                       WebView's plaintext localStorage.
                       DESC
  s.homepage         = 'https://github.com/octane/social-driving'
  s.license          = { :type => 'MIT' }
  s.author           = { 'Octane' => 'dev@octane.app' }
  s.source           = { :path => '.' }

  s.source_files     = 'SecureStoragePlugin.swift'
  s.ios.deployment_target = '13.0'
  s.swift_version    = '5'

  s.dependency 'Capacitor'
  s.frameworks      = 'Security'
end