from pathlib import Path
import math, random, struct, wave

ROOT = Path(__file__).resolve().parents[1]
MAIN = ROOT / 'app' / 'src' / 'main'
RES = MAIN / 'res'

for p in [RES/'values', RES/'values-v31', RES/'drawable', RES/'mipmap-anydpi-v26', RES/'raw']:
    p.mkdir(parents=True, exist_ok=True)

(MAIN/'AndroidManifest.xml').write_text('''<manifest xmlns:android="http://schemas.android.com/apk/res/android">\n    <application\n        android:allowBackup="true"\n        android:icon="@mipmap/ic_launcher"\n        android:roundIcon="@mipmap/ic_launcher_round"\n        android:label="오답 지명수배"\n        android:supportsRtl="true"\n        android:theme="@style/AppTheme">\n        <activity\n            android:name=".MainActivity"\n            android:exported="true"\n            android:screenOrientation="portrait">\n            <intent-filter>\n                <action android:name="android.intent.action.MAIN" />\n                <category android:name="android.intent.category.LAUNCHER" />\n            </intent-filter>\n        </activity>\n    </application>\n</manifest>\n''', encoding='utf-8')

(RES/'values'/'colors.xml').write_text('''<resources>\n    <color name="icon_bg">#1C0C45</color>\n</resources>\n''', encoding='utf-8')

(RES/'values'/'styles.xml').write_text('''<resources>\n    <style name="AppTheme" parent="android:style/Theme.Material.NoActionBar">\n        <item name="android:fontFamily">sans</item>\n        <item name="android:windowActionModeOverlay">true</item>\n        <item name="android:colorAccent">#B39CFF</item>\n        <item name="android:navigationBarColor">#14082F</item>\n        <item name="android:statusBarColor">#14082F</item>\n        <item name="android:windowLightStatusBar">false</item>\n        <item name="android:windowLightNavigationBar">false</item>\n    </style>\n</resources>\n''', encoding='utf-8')

(RES/'values-v31'/'styles.xml').write_text('''<resources>\n    <style name="AppTheme" parent="android:style/Theme.Material.NoActionBar">\n        <item name="android:fontFamily">sans</item>\n        <item name="android:colorAccent">#B39CFF</item>\n        <item name="android:navigationBarColor">#14082F</item>\n        <item name="android:statusBarColor">#14082F</item>\n        <item name="android:windowSplashScreenBackground">#1C0C45</item>\n        <item name="android:windowSplashScreenAnimatedIcon">@drawable/ic_launcher_foreground</item>\n        <item name="android:windowSplashScreenAnimationDuration">350</item>\n    </style>\n</resources>\n''', encoding='utf-8')

(RES/'drawable'/'ic_launcher_foreground.xml').write_text('''<vector xmlns:android="http://schemas.android.com/apk/res/android"\n    android:width="108dp" android:height="108dp"\n    android:viewportWidth="108" android:viewportHeight="108">\n    <path android:fillColor="#FFFFFF" android:pathData="M20,18h68a10,10 0,0 1,10 10v52a10,10 0,0 1,-10 10h-68a10,10 0,0 1,-10 -10v-52a10,10 0,0 1,10 -10z"/>\n    <path android:fillColor="#FFD35A" android:pathData="M31,31L45,45L31,59L38,66L52,52L66,66L73,59L59,45L73,31L66,24L52,38L38,24z"/>\n    <path android:fillColor="#6D45D6" android:pathData="M71,62a13,13 0,1 0,0 26a13,13 0,1 0,0 -26M71,68a7,7 0,1 1,0 14a7,7 0,1 1,0 -14M80,82L95,97L90,102L75,87z"/>\n</vector>\n''', encoding='utf-8')

adaptive = '''<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">\n    <background android:drawable="@color/icon_bg" />\n    <foreground android:drawable="@drawable/ic_launcher_foreground" />\n</adaptive-icon>\n'''
(RES/'mipmap-anydpi-v26'/'ic_launcher.xml').write_text(adaptive, encoding='utf-8')
(RES/'mipmap-anydpi-v26'/'ic_launcher_round.xml').write_text(adaptive, encoding='utf-8')

SR = 44100
RAW = RES/'raw'

def write_wav(name, samples):
    samples = [max(-1.0, min(1.0, x)) for x in samples]
    with wave.open(str(RAW/name), 'wb') as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes(b''.join(struct.pack('<h', int(x*32767)) for x in samples))

def tone(freq, dur, vol=.4, square=False):
    n = int(SR*dur); out=[]
    for i in range(n):
        t=i/SR
        env=min(1,t/.015)*min(1,max(0,(dur-t)/.06))
        s=math.sin(2*math.pi*freq*t)
        if square: s=1 if s>=0 else -1
        out.append(s*vol*env)
    return out

def mix(parts, total):
    out=[0.0]*int(SR*total)
    for start,data,gain in parts:
        base=int(start*SR)
        for i,x in enumerate(data):
            if base+i < len(out): out[base+i]+=x*gain
    return out

# 152 BPM original chase-loop generated locally during the CI build.
bpm=152; beat=60/bpm; bars=4; length=bars*4*beat
roots=[261.63,293.66,329.63,392.00]
parts=[]
for bar in range(bars):
    root=roots[bar]
    for b in range(4):
        t=(bar*4+b)*beat
        kick=[]
        for i in range(int(SR*.12)):
            tt=i/SR; f=115-65*(tt/.12); kick.append(math.sin(2*math.pi*f*tt)*.7*math.exp(-tt*28))
        parts.append((t,kick,.65))
        if b in (1,3):
            noise=[]
            for i in range(int(SR*.10)):
                tt=i/SR; noise.append((random.random()*2-1)*math.exp(-tt*35))
            parts.append((t,noise,.22))
        parts.append((t,tone(root/2,beat*.85,.28,True),.34))
        chord=[root,root*1.25,root*1.5,root*2]
        for k in range(8):
            parts.append((t+k*beat/2,tone(chord[k%4],beat*.42,.18,True),.22))
write_wav('bgm_chase_loop.wav', mix(parts,length))
write_wav('launch_sfx.wav', mix([(0,tone(523,.22,.45),1),(.12,tone(784,.32,.4),1)],.55))
write_wav('tap_sfx.wav', tone(900,.06,.35))
write_wav('correct_sfx.wav', mix([(0,tone(660,.14,.45),1),(.10,tone(880,.18,.45),1),(.22,tone(1175,.24,.4),1)],.5))
write_wav('wrong_sfx.wav', mix([(0,tone(220,.18,.5,True),1),(.12,tone(165,.24,.45,True),1)],.45))
write_wav('capture_sfx.wav', mix([(0,tone(392,.16,.4),1),(.10,tone(523,.18,.45),1),(.22,tone(784,.30,.45),1),(.38,tone(1047,.36,.4),1)],.8))

print('Prepared manifest, launcher resources and 6 audio assets.')
