package kr.co.hankukpol.wronganswerhunt;

import android.app.Activity;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.media.MediaPlayer;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.Gravity;
import android.view.HapticFeedbackConstants;
import android.view.View;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.ScrollView;
import android.widget.TextView;

import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.List;
import java.util.Locale;

public class MainActivity extends Activity {
    private static final int BG = Color.rgb(20, 8, 47);
    private static final int PANEL = Color.rgb(38, 20, 76);
    private static final int PURPLE = Color.rgb(109, 69, 214);
    private static final int LIGHT = Color.rgb(188, 164, 255);
    private static final int GOLD = Color.rgb(255, 211, 83);
    private static final int GREEN = Color.rgb(70, 214, 153);
    private static final int RED = Color.rgb(255, 92, 113);
    private static final int MUTED = Color.rgb(214, 204, 233);

    private final Handler handler = new Handler(Looper.getMainLooper());
    private final List<Question> active = new ArrayList<>();
    private SharedPreferences prefs;
    private MediaPlayer bgm;
    private MediaPlayer sfx;
    private boolean musicOn = true;
    private boolean sfxOn = true;
    private String subject = "경찰학";
    private int qIndex = 0;
    private int correct = 0;
    private int solved = 0;
    private int combo = 0;
    private int selected = -1;
    private boolean checked = false;

    private static class Question {
        final String subject, stem, explanation;
        final String[] choices;
        final int answer;
        Question(String subject, String stem, String[] choices, int answer, String explanation) {
            this.subject = subject;
            this.stem = stem;
            this.choices = choices;
            this.answer = answer;
            this.explanation = explanation;
        }
    }

    private final Question[] bank = new Question[]{
        new Question("경찰학", "경찰권 발동은 목적 달성에 필요한 범위를 넘지 않아야 한다는 원칙은?",
            new String[]{"신뢰보호의 원칙", "비례의 원칙", "평등의 원칙", "자기구속의 원칙"}, 1,
            "경찰권 발동은 적합성·필요성·상당성을 갖추고 필요한 최소 범위에 그쳐야 합니다."),
        new Question("경찰학", "계층제 조직의 일반적인 장점으로 가장 적절한 것은?",
            new String[]{"의사결정 단계가 항상 줄어든다", "책임과 권한 관계가 비교적 명확하다", "수평적 협업이 자동 강화된다", "전문가 자율성이 항상 커진다"}, 1,
            "계층제는 명령·보고 체계와 책임 소재가 비교적 명확하다는 장점이 있습니다."),
        new Question("경찰학", "지역사회 경찰활동의 방향과 가장 가까운 것은?",
            new String[]{"사후 검거만 최우선", "주민과 협력해 지역 문제를 예방적으로 해결", "모든 업무를 중앙에서 획일 처리", "민원 접촉 최소화"}, 1,
            "지역사회 경찰활동은 주민 협력, 문제지향적 접근, 범죄 예방을 중요하게 봅니다."),
        new Question("형사법", "죄형법정주의의 취지와 가장 가까운 설명은?",
            new String[]{"형벌권 행사를 법률에 의해 제한한다", "법관이 범죄를 새로 만들 수 있다", "모든 관습을 형벌법규로 인정한다", "불리한 유추해석을 넓게 허용한다"}, 0,
            "죄형법정주의는 범죄와 형벌을 법률로 정해 형벌권을 제한하고 국민의 자유를 보장합니다."),
        new Question("형사법", "고의에 대한 설명으로 가장 적절한 것은?",
            new String[]{"결과 가능성을 전혀 인식 못한 경우만 말한다", "범죄사실을 인식하고 실현하려는 의사를 포함한다", "과실과 완전히 같은 개념이다", "모든 범죄에서 고의가 필요하다"}, 1,
            "고의는 구성요건적 사실을 인식하고 그 실현을 의욕하거나 용인하는 주관적 요소입니다."),
        new Question("헌법", "기본권 제한이 필요한 경우에도 제한의 정도가 지나치지 않아야 한다는 원칙은?",
            new String[]{"과잉금지 원칙", "소급입법 원칙", "포괄위임 원칙", "무제한 유보 원칙"}, 0,
            "기본권 제한은 목적의 정당성, 수단의 적합성, 침해의 최소성, 법익의 균형성을 충족해야 합니다."),
        new Question("헌법", "대한민국 헌법상 국가권력 행사의 기본 원리로 가장 적절한 것은?",
            new String[]{"국민주권의 원리", "세습권력의 원리", "무제한 행정권의 원리", "법률 배제의 원리"}, 0,
            "대한민국 헌법은 주권이 국민에게 있고 모든 권력이 국민으로부터 나온다는 국민주권 원리를 채택합니다.")
    };

    @Override protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        prefs = getSharedPreferences("wrong_answer_hunt", MODE_PRIVATE);
        musicOn = prefs.getBoolean("music", true);
        sfxOn = prefs.getBoolean("sfx", true);
        hideBars();
        prepareBgm();
        showSplash();
    }

    private void hideBars() {
        getWindow().getDecorView().setSystemUiVisibility(
            View.SYSTEM_UI_FLAG_FULLSCREEN |
            View.SYSTEM_UI_FLAG_HIDE_NAVIGATION |
            View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY |
            View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN |
            View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION |
            View.SYSTEM_UI_FLAG_LAYOUT_STABLE);
    }

    private void prepareBgm() {
        try {
            bgm = MediaPlayer.create(this, R.raw.bgm_chase_loop);
            if (bgm != null) {
                bgm.setLooping(true);
                bgm.setVolume(0.22f, 0.22f);
                if (musicOn) bgm.start();
            }
        } catch (Exception ignored) {}
    }

    private void play(int res, float vol) {
        if (!sfxOn) return;
        try {
            if (sfx != null) { sfx.release(); sfx = null; }
            sfx = MediaPlayer.create(this, res);
            if (sfx != null) {
                sfx.setVolume(vol, vol);
                sfx.setOnCompletionListener(mp -> { mp.release(); if (sfx == mp) sfx = null; });
                sfx.start();
            }
        } catch (Exception ignored) {}
    }

    private void showSplash() {
        FrameLayout root = new FrameLayout(this);
        root.setBackground(new GradientDrawable(GradientDrawable.Orientation.BL_TR,
            new int[]{0xFF14082F, 0xFF2B145F, 0xFF5531A8, 0xFF1B0C45}));

        ImageView icon = new ImageView(this);
        icon.setImageResource(R.drawable.ic_launcher_foreground);
        icon.setAlpha(0f); icon.setScaleX(.72f); icon.setScaleY(.72f);
        FrameLayout.LayoutParams ip = new FrameLayout.LayoutParams(dp(190), dp(190), Gravity.CENTER_HORIZONTAL | Gravity.TOP);
        ip.topMargin = dp(130);
        root.addView(icon, ip);
        icon.animate().alpha(1f).scaleX(1f).scaleY(1f).rotationBy(4f).setDuration(650).start();

        TextView kicker = label("김민현 경찰학", 20, GOLD, true);
        kicker.setGravity(Gravity.CENTER);
        FrameLayout.LayoutParams kp = new FrameLayout.LayoutParams(-1, dp(48), Gravity.TOP);
        kp.setMargins(dp(30), dp(320), dp(30), 0);
        root.addView(kicker, kp);

        TextView title = label("오답 지명수배", 40, Color.WHITE, true);
        title.setGravity(Gravity.CENTER);
        FrameLayout.LayoutParams tp = new FrameLayout.LayoutParams(-1, dp(70), Gravity.TOP);
        tp.setMargins(dp(20), dp(365), dp(20), 0);
        root.addView(title, tp);

        TextView sub = label("틀린 문제를 추적하고 검거하라!", 16, MUTED, false);
        sub.setGravity(Gravity.CENTER);
        FrameLayout.LayoutParams subp = new FrameLayout.LayoutParams(-1, dp(48), Gravity.TOP);
        subp.setMargins(dp(20), dp(430), dp(20), 0);
        root.addView(sub, subp);

        ProgressBar bar = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal);
        bar.setMax(100); bar.setProgress(0); bar.getProgressDrawable().setTint(LIGHT);
        FrameLayout.LayoutParams bp = new FrameLayout.LayoutParams(-1, dp(9), Gravity.BOTTOM);
        bp.setMargins(dp(50), 0, dp(50), dp(95));
        root.addView(bar, bp);

        TextView status = label("학습 기록 준비 중", 17, Color.WHITE, true);
        status.setGravity(Gravity.CENTER);
        FrameLayout.LayoutParams sp = new FrameLayout.LayoutParams(-1, dp(46), Gravity.BOTTOM);
        sp.setMargins(dp(24), 0, dp(24), dp(38));
        root.addView(status, sp);

        TextView start = button("오답 수배 시작  ›", GOLD, Color.rgb(43, 20, 83));
        start.setVisibility(View.INVISIBLE); start.setAlpha(0f);
        FrameLayout.LayoutParams stp = new FrameLayout.LayoutParams(-1, dp(58), Gravity.BOTTOM);
        stp.setMargins(dp(44), 0, dp(44), dp(40));
        root.addView(start, stp);
        start.setOnClickListener(v -> {
            tap(v); play(R.raw.capture_sfx, .65f);
            v.animate().scaleX(.96f).scaleY(.96f).setDuration(70).withEndAction(() -> {
                v.animate().scaleX(1f).scaleY(1f).setDuration(90).start();
                handler.postDelayed(this::showHome, 110);
            }).start();
        });

        addSoundToggle(root);
        setContentView(root);
        play(R.raw.launch_sfx, .45f);

        long begin = System.currentTimeMillis();
        Runnable r = new Runnable() {
            @Override public void run() {
                int p = (int)Math.min(100, (System.currentTimeMillis() - begin) / 22);
                bar.setProgress(p);
                if (p < 100) handler.postDelayed(this, 28);
                else {
                    status.animate().alpha(0f).setDuration(180).start();
                    bar.animate().alpha(0f).setDuration(180).withEndAction(() -> {
                        status.setVisibility(View.GONE); bar.setVisibility(View.GONE);
                        start.setVisibility(View.VISIBLE); start.setTranslationY(dp(14));
                        start.animate().alpha(1f).translationY(0).setDuration(320).start();
                    }).start();
                }
            }
        };
        handler.post(r);
    }

    private void showHome() {
        FrameLayout root = root();
        LinearLayout body = body(root);
        body.addView(label("KIM MIN HYUN · POLICE SCIENCE", 12, GOLD, true));
        spacer(body, 10);
        body.addView(label("오답 지명수배", 34, Color.WHITE, true));
        body.addView(label("틀린 문제는 도망치기 전에 오늘 잡습니다.", 15, MUTED, false));
        spacer(body, 22);

        int total = prefs.getInt("captured_total", 0);
        int sessions = prefs.getInt("sessions", 0);
        LinearLayout stats = new LinearLayout(this); stats.setOrientation(LinearLayout.HORIZONTAL);
        stats.addView(statCard("누적 검거", total + "문항"), new LinearLayout.LayoutParams(0, dp(105), 1));
        spacerH(stats, 10);
        stats.addView(statCard("출동 횟수", sessions + "회"), new LinearLayout.LayoutParams(0, dp(105), 1));
        body.addView(stats, match());
        spacer(body, 18);

        TextView mission = panelText("오늘의 수배 작전\n\n오답을 다시 풀고 정답을 맞히면 검거 성공!\n연속 정답으로 COMBO를 올려보세요.");
        body.addView(mission, match());
        spacer(body, 18);

        TextView go = button("🚨  오늘의 오답 수배 시작", GOLD, Color.rgb(43,20,83));
        go.setOnClickListener(v -> { tap(v); play(R.raw.tap_sfx,.6f); showSubjects(); });
        body.addView(go, new LinearLayout.LayoutParams(-1, dp(62)));
        spacer(body, 12);

        TextView records = button("📋  최근 검거 기록", PURPLE, Color.WHITE);
        records.setOnClickListener(v -> { tap(v); showRecords(); });
        body.addView(records, new LinearLayout.LayoutParams(-1, dp(54)));

        addSoundToggle(root);
        setContentView(root);
    }

    private void showSubjects() {
        FrameLayout root = root();
        LinearLayout body = body(root);
        body.addView(label("수배 지역 선택", 29, Color.WHITE, true));
        body.addView(label("오늘 다시 잡을 과목을 선택하세요.", 15, MUTED, false));
        spacer(body, 20);
        addSubject(body, "경찰학", "🚓", "현장지휘 · 조직 · 경찰활동", 3);
        spacer(body, 12);
        addSubject(body, "형사법", "🔎", "죄형법정주의 · 고의", 2);
        spacer(body, 12);
        addSubject(body, "헌법", "⚖️", "기본권 · 국민주권", 2);
        spacer(body, 18);
        TextView back = button("‹  작전본부로", Color.rgb(56,39,90), Color.WHITE);
        back.setOnClickListener(v -> showHome());
        body.addView(back, new LinearLayout.LayoutParams(-1, dp(52)));
        addSoundToggle(root);
        setContentView(root);
    }

    private void addSubject(LinearLayout body, String name, String emoji, String desc, int count) {
        TextView card = panelText(emoji + "  " + name + "\n" + desc + "\n\n미검거 오답  " + count + "건     출동 ›");
        card.setOnClickListener(v -> { tap(v); play(R.raw.capture_sfx,.5f); startGame(name); });
        body.addView(card, new LinearLayout.LayoutParams(-1, dp(145)));
    }

    private void startGame(String s) {
        subject = s; active.clear();
        for (Question q : bank) if (q.subject.equals(s)) active.add(q);
        qIndex = 0; correct = 0; solved = 0; combo = 0; selected = -1; checked = false;
        showQuestion();
    }

    private void showQuestion() {
        if (qIndex >= active.size()) { showComplete(); return; }
        Question q = active.get(qIndex);
        selected = -1; checked = false;

        FrameLayout root = root();
        LinearLayout body = body(root);
        LinearLayout hud = new LinearLayout(this); hud.setOrientation(LinearLayout.HORIZONTAL); hud.setGravity(Gravity.CENTER_VERTICAL);
        TextView wanted = label("WANTED · " + subject, 12, GOLD, true);
        TextView comboView = label("COMBO ×" + combo, 13, combo >= 2 ? GOLD : MUTED, true);
        hud.addView(wanted, new LinearLayout.LayoutParams(0, dp(36), 1));
        hud.addView(comboView, wrap());
        body.addView(hud, match());

        ProgressBar progress = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal);
        progress.setMax(active.size()); progress.setProgress(qIndex + 1); progress.getProgressDrawable().setTint(GOLD);
        body.addView(progress, new LinearLayout.LayoutParams(-1, dp(8)));
        spacer(body, 12);
        body.addView(label("수배번호  " + (qIndex + 1) + " / " + active.size(), 13, MUTED, false));
        spacer(body, 14);

        TextView stem = panelText("❌  오답 용의자\n\n" + q.stem);
        stem.setTextSize(19); stem.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        body.addView(stem, new LinearLayout.LayoutParams(-1, dp(160)));
        spacer(body, 14);

        final List<TextView> choices = new ArrayList<>();
        for (int i = 0; i < q.choices.length; i++) {
            final int idx = i;
            TextView c = answerButton((i + 1) + ".  " + q.choices[i]);
            c.setOnClickListener(v -> {
                if (checked) return;
                selected = idx; tap(v); play(R.raw.tap_sfx,.45f);
                for (TextView t : choices) setAnswerStyle(t, false, false, false);
                setAnswerStyle(c, true, false, false);
            });
            choices.add(c); body.addView(c, new LinearLayout.LayoutParams(-1, dp(60)));
            spacer(body, 9);
        }

        TextView check = button("정답 확인 · 검거 시도", GOLD, Color.rgb(43,20,83));
        check.setOnClickListener(v -> {
            if (checked || selected < 0) {
                if (selected < 0) flashMessage(root, "선택지를 먼저 지목하세요!", GOLD);
                return;
            }
            checked = true; solved++;
            boolean ok = selected == q.answer;
            if (ok) { correct++; combo++; play(R.raw.correct_sfx,.85f); }
            else { combo = 0; play(R.raw.wrong_sfx,.85f); shake(stem); }
            for (int i=0;i<choices.size();i++) {
                setAnswerStyle(choices.get(i), i==selected, i==q.answer, !ok && i==selected);
            }
            check.setVisibility(View.GONE);

            TextView explain = panelText((ok ? "✅ 검거 성공!" : "⚠️ 용의자 도주!") + "\n\n" + q.explanation);
            explain.setTextColor(Color.WHITE);
            explain.setAlpha(0f); explain.setTranslationY(dp(12));
            body.addView(explain, new LinearLayout.LayoutParams(-1, dp(145)));
            explain.animate().alpha(1f).translationY(0).setDuration(250).start();
            spacer(body, 10);

            TextView next = button(qIndex + 1 == active.size() ? "수배 결과 확인  ›" : "다음 용의자 추적  ›",
                ok ? GREEN : PURPLE, Color.WHITE);
            next.setAlpha(0f); next.setScaleX(.94f); next.setScaleY(.94f);
            next.setOnClickListener(x -> { tap(x); qIndex++; showQuestion(); });
            body.addView(next, new LinearLayout.LayoutParams(-1, dp(58)));
            next.animate().alpha(1f).scaleX(1f).scaleY(1f).setDuration(240).start();
            if (ok) captureBurst(root, combo);
            else flashMessage(root, "도주 경고 · 다음에 반드시 검거!", RED);
        });
        body.addView(check, new LinearLayout.LayoutParams(-1, dp(58)));
        spacer(body, 28);
        setContentView(root);
    }

    private void showComplete() {
        prefs.edit()
            .putInt("captured_total", prefs.getInt("captured_total",0) + correct)
            .putInt("sessions", prefs.getInt("sessions",0) + 1)
            .putString("last_record", now() + " · " + subject + " · " + correct + "/" + solved)
            .apply();
        play(R.raw.capture_sfx,.85f);
        FrameLayout root = root();
        LinearLayout body = body(root); body.setGravity(Gravity.CENTER_HORIZONTAL);
        spacer(body, 50);
        TextView badge = label("CASE CLOSED", 14, GOLD, true); badge.setGravity(Gravity.CENTER); body.addView(badge, match());
        spacer(body, 14);
        TextView big = label("🎉", 72, Color.WHITE, false); big.setGravity(Gravity.CENTER); body.addView(big, match());
        TextView title = label("수배 작전 완료", 32, Color.WHITE, true); title.setGravity(Gravity.CENTER); body.addView(title, match());
        TextView score = label(correct + " / " + solved + " 검거 성공", 24, GOLD, true); score.setGravity(Gravity.CENTER); body.addView(score, match());
        spacer(body, 16);
        int rate = solved == 0 ? 0 : Math.round(correct * 100f / solved);
        TextView result = panelText("검거율  " + rate + "%\n\n" + (rate == 100 ? "완벽한 수배 종료!" : rate >= 60 ? "좋습니다. 놓친 오답을 다시 추적하세요." : "아직 도주한 오답이 많습니다. 재출동 권장!"));
        result.setGravity(Gravity.CENTER); body.addView(result, new LinearLayout.LayoutParams(-1, dp(150)));
        spacer(body, 18);
        TextView retry = button("↻  같은 과목 재출동", GOLD, Color.rgb(43,20,83));
        retry.setOnClickListener(v -> startGame(subject)); body.addView(retry, new LinearLayout.LayoutParams(-1, dp(58)));
        spacer(body, 10);
        TextView home = button("작전본부로 돌아가기", PURPLE, Color.WHITE);
        home.setOnClickListener(v -> showHome()); body.addView(home, new LinearLayout.LayoutParams(-1, dp(54)));
        captureBurst(root, Math.max(2, combo));
        addSoundToggle(root);
        setContentView(root);
    }

    private void showRecords() {
        FrameLayout root = root(); LinearLayout body = body(root);
        body.addView(label("검거 기록", 30, Color.WHITE, true));
        body.addView(label("기기에 저장된 최근 학습 결과입니다.", 14, MUTED, false));
        spacer(body, 20);
        String last = prefs.getString("last_record", "아직 기록이 없습니다.");
        body.addView(panelText("최근 출동\n\n" + last), new LinearLayout.LayoutParams(-1, dp(130)));
        spacer(body, 12);
        body.addView(panelText("누적 검거  " + prefs.getInt("captured_total",0) + "문항\n출동 횟수  " + prefs.getInt("sessions",0) + "회"), new LinearLayout.LayoutParams(-1, dp(120)));
        spacer(body, 18);
        TextView back = button("‹  작전본부로", PURPLE, Color.WHITE); back.setOnClickListener(v -> showHome());
        body.addView(back, new LinearLayout.LayoutParams(-1, dp(54)));
        addSoundToggle(root); setContentView(root);
    }

    private FrameLayout root() {
        FrameLayout root = new FrameLayout(this); root.setBackgroundColor(BG); return root;
    }

    private LinearLayout body(FrameLayout root) {
        ScrollView scroll = new ScrollView(this); scroll.setFillViewport(true);
        LinearLayout body = new LinearLayout(this); body.setOrientation(LinearLayout.VERTICAL);
        body.setPadding(dp(22), dp(58), dp(22), dp(42));
        scroll.addView(body, new ScrollView.LayoutParams(-1,-2));
        root.addView(scroll, new FrameLayout.LayoutParams(-1,-1));
        return body;
    }

    private TextView label(String s, int sp, int color, boolean bold) {
        TextView t = new TextView(this); t.setText(s); t.setTextSize(sp); t.setTextColor(color);
        if (bold) t.setTypeface(Typeface.DEFAULT, Typeface.BOLD); t.setGravity(Gravity.CENTER_VERTICAL); return t;
    }

    private TextView button(String s, int bg, int fg) {
        TextView t = label(s, 16, fg, true); t.setGravity(Gravity.CENTER); t.setBackground(round(bg, 22, bg));
        t.setPadding(dp(14),0,dp(14),0); t.setClickable(true); t.setFocusable(true); return t;
    }

    private TextView panelText(String s) {
        TextView t = label(s, 15, Color.WHITE, false); t.setGravity(Gravity.CENTER_VERTICAL);
        t.setPadding(dp(18),dp(14),dp(18),dp(14)); t.setBackground(round(PANEL,20,Color.rgb(73,49,120))); return t;
    }

    private TextView answerButton(String s) {
        TextView t = label(s, 15, Color.WHITE, false); t.setPadding(dp(16),0,dp(14),0);
        setAnswerStyle(t,false,false,false); return t;
    }

    private void setAnswerStyle(TextView t, boolean selectedState, boolean answer, boolean wrong) {
        int bg = Color.rgb(49,31,88), stroke = Color.rgb(83,62,127), fg = Color.WHITE;
        if (answer) { bg = Color.rgb(34,105,82); stroke = GREEN; }
        else if (wrong) { bg = Color.rgb(113,37,58); stroke = RED; }
        else if (selectedState) { bg = Color.rgb(75,51,136); stroke = GOLD; }
        t.setTextColor(fg); t.setBackground(round(bg,18,stroke));
    }

    private LinearLayout statCard(String top, String bottom) {
        LinearLayout box = new LinearLayout(this); box.setOrientation(LinearLayout.VERTICAL); box.setGravity(Gravity.CENTER);
        box.setBackground(round(PANEL,20,Color.rgb(73,49,120)));
        TextView a = label(top,13,MUTED,false); a.setGravity(Gravity.CENTER);
        TextView b = label(bottom,24,GOLD,true); b.setGravity(Gravity.CENTER);
        box.addView(a, new LinearLayout.LayoutParams(-1,dp(36))); box.addView(b, new LinearLayout.LayoutParams(-1,dp(45))); return box;
    }

    private GradientDrawable round(int color, int radius, int stroke) {
        GradientDrawable d = new GradientDrawable(); d.setColor(color); d.setCornerRadius(dp(radius)); d.setStroke(dp(1),stroke); return d;
    }

    private void addSoundToggle(FrameLayout root) {
        TextView t = label(musicOn ? "♪ ON" : "♪ OFF", 12, Color.WHITE, true); t.setGravity(Gravity.CENTER);
        t.setBackground(round(0xA52B165B,18,0x66FFFFFF));
        FrameLayout.LayoutParams lp = new FrameLayout.LayoutParams(dp(64),dp(38),Gravity.TOP|Gravity.END);
        lp.setMargins(0,dp(14),dp(14),0); root.addView(t,lp);
        t.setOnClickListener(v -> {
            musicOn = !musicOn; prefs.edit().putBoolean("music",musicOn).apply();
            if (bgm != null) { if (musicOn) bgm.start(); else bgm.pause(); }
            t.setText(musicOn ? "♪ ON" : "♪ OFF"); tap(v);
        });
    }

    private void flashMessage(FrameLayout root, String text, int color) {
        TextView toast = label(text, 15, Color.WHITE, true); toast.setGravity(Gravity.CENTER);
        toast.setBackground(round(color,18,color)); toast.setAlpha(0f); toast.setTranslationY(-dp(12));
        FrameLayout.LayoutParams lp = new FrameLayout.LayoutParams(-1,dp(50),Gravity.TOP);
        lp.setMargins(dp(25),dp(70),dp(25),0); root.addView(toast,lp);
        toast.animate().alpha(1f).translationY(0).setDuration(180).withEndAction(() ->
            handler.postDelayed(() -> toast.animate().alpha(0f).translationY(-dp(10)).setDuration(220).withEndAction(() -> root.removeView(toast)).start(), 850)
        ).start();
    }

    private void captureBurst(FrameLayout root, int streak) {
        String[] marks = new String[]{"★","✦","✓","+1","★","✦"};
        for (int i=0;i<marks.length;i++) {
            final TextView p = label(marks[i], 20 + (i%3)*4, i%2==0 ? GOLD : GREEN, true);
            p.setGravity(Gravity.CENTER); p.setAlpha(0f); p.setScaleX(.5f); p.setScaleY(.5f);
            FrameLayout.LayoutParams lp = new FrameLayout.LayoutParams(dp(60),dp(50),Gravity.CENTER);
            lp.leftMargin = (i-3)*dp(18); lp.topMargin = (i%2==0 ? -1:1)*dp(20);
            root.addView(p,lp);
            p.setTranslationX((i-3)*dp(12)); p.setTranslationY(dp(25));
            long delay = i*45L;
            p.animate().setStartDelay(delay).alpha(1f).scaleX(1.2f).scaleY(1.2f).translationY(-dp(55+i*4)).setDuration(380)
                .withEndAction(() -> p.animate().alpha(0f).setDuration(180).withEndAction(() -> root.removeView(p)).start()).start();
        }
        if (streak >= 2) flashMessage(root, "🔥 COMBO ×" + streak + " · 연속 검거!", GOLD);
    }

    private void shake(View v) {
        v.animate().translationX(dp(10)).setDuration(55).withEndAction(() ->
            v.animate().translationX(-dp(10)).setDuration(70).withEndAction(() ->
                v.animate().translationX(dp(5)).setDuration(60).withEndAction(() ->
                    v.animate().translationX(0).setDuration(60).start()).start()).start()).start();
    }

    private void tap(View v) { v.performHapticFeedback(HapticFeedbackConstants.KEYBOARD_TAP); }
    private String now() { return new SimpleDateFormat("MM.dd HH:mm", Locale.KOREA).format(new Date()); }
    private int dp(int v) { return Math.round(v * getResources().getDisplayMetrics().density); }
    private LinearLayout.LayoutParams match() { return new LinearLayout.LayoutParams(-1,-2); }
    private LinearLayout.LayoutParams wrap() { return new LinearLayout.LayoutParams(-2,-2); }
    private void spacer(LinearLayout p, int h) { View v=new View(this); p.addView(v,new LinearLayout.LayoutParams(1,dp(h))); }
    private void spacerH(LinearLayout p, int w) { View v=new View(this); p.addView(v,new LinearLayout.LayoutParams(dp(w),1)); }

    @Override protected void onPause() { super.onPause(); if (bgm != null && bgm.isPlaying()) bgm.pause(); }
    @Override protected void onResume() { super.onResume(); hideBars(); if (musicOn && bgm != null && !bgm.isPlaying()) bgm.start(); }
    @Override protected void onDestroy() { super.onDestroy(); handler.removeCallbacksAndMessages(null); if (bgm != null) bgm.release(); if (sfx != null) sfx.release(); }
    @Override public void onBackPressed() { showHome(); }
}
