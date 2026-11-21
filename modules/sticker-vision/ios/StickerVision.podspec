Pod::Spec.new do |s|
  s.name           = 'StickerVision'
  s.version        = '1.0.0'
  s.summary        = 'On-device foreground cutout for stickers'
  s.description    = 'Uses Vision to lift the foreground subject, adds a white sticker border, and returns a transparent PNG.'
  s.author         = ''
  s.homepage       = 'https://docs.expo.dev/modules/'
  s.platforms      = {
    :ios => '16.4'
  }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  s.frameworks = 'Vision', 'CoreImage', 'UIKit'

  # Swift/Objective-C compatibility
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
  }

  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
end
