import React, {useEffect, useMemo, useRef} from 'react';
import Animated, {
  cancelAnimation,
  Easing,
  runOnJS,
  useAnimatedProps,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import {Gesture, GestureDetector} from 'react-native-gesture-handler';
import Svg, {
  Circle,
  Defs,
  Ellipse,
  G,
  LinearGradient,
  Path,
  Rect,
  Stop,
} from 'react-native-svg';

/**
 * DRS Bot — the interactive onboarding mascot.
 *
 * A hand-built SVG robot (matching the v1.21 launcher art: glossy white
 * shell, dark visor, glowing cyan eyes, brand-gradient accents) animated
 * with Reanimated 4 shared values and made interactive through
 * gesture-handler:
 *
 *  - always: floating bob, blinking, antenna glow pulse, chest-core pulse
 *  - tap: happy hop (eyes squint); 3 quick taps: 360° spin
 *  - touch-drag anywhere on the illustration: eyes follow the finger
 *  - mood: 'idle' | 'wave' | 'thinking' | 'shield' | 'point' | 'celebrate'
 *
 * The component is purely illustrative — no testIDs, no store access — so
 * the onboarding E2E contract is unaffected.
 */

const AnimatedG = Animated.createAnimatedComponent(G);
const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const AnimatedEllipse = Animated.createAnimatedComponent(Ellipse);

// ── Palette (matches the v1.21 brand icon art) ────────────────────────
const SHELL = '#F6F7FF';
const SHELL_SHADE = '#D9DEF3';
const SHELL_STROKE = '#C3CBEA';
const VISOR = '#171233';
const VISOR_INNER = '#241D4E';
const EYE = '#54C8FF';
const EYE_GLOW = '#54C8FF';
const BRAND_VIOLET = '#7C3AED';
const BRAND_BLUE = '#2563EB';
const BADGE_BG = '#FFFFFF';

export type RobotMood =
  | 'idle'
  | 'wave'
  | 'thinking'
  | 'shield'
  | 'point'
  | 'celebrate';

export type RobotBadge = 'none' | 'wifi-off' | 'shield' | 'spark';

export interface RobotMascotProps {
  /** Rendered width in points; height keeps the 200:210 aspect. */
  size?: number;
  mood?: RobotMood;
  badge?: RobotBadge;
}

const BOB_DURATION: Record<RobotMood, number> = {
  idle: 2000,
  wave: 1800,
  thinking: 2600,
  shield: 2200,
  point: 2000,
  celebrate: 950,
};

export const RobotMascot: React.FC<RobotMascotProps> = ({
  size = 180,
  mood = 'idle',
  badge = 'none',
}) => {
  const height = (size * 210) / 200;

  // ── shared values ────────────────────────────────────────────────
  const bob = useSharedValue(0); // whole-body float offset
  const spin = useSharedValue(0); // 360° easter-egg spin
  const headTilt = useSharedValue(0); // thinking tilt
  const armL = useSharedValue(0); // left arm angle (deg, hanging = 0)
  const armR = useSharedValue(0); // right arm angle
  const coreGlow = useSharedValue(0.25); // chest core ring opacity
  const antennaGlow = useSharedValue(0.2); // antenna halo opacity
  const blinkRy = useSharedValue(8); // eye ry (blink squashes it)
  const happy = useSharedValue(0); // 0 = normal eyes, 1 = happy arcs
  const eyeX = useSharedValue(0); // eye tracking offset
  const eyeY = useSharedValue(0);
  const badgeY = useSharedValue(0); // badge float
  const happyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTap = useRef(0);

  // ── ambient loops (bob + glows), restarted per mood ─────────────
  useEffect(() => {
    bob.value = 0;
    bob.value = withRepeat(
      withSequence(
        withTiming(-7, {
          duration: BOB_DURATION[mood] / 2,
          easing: Easing.inOut(Easing.quad),
        }),
        withTiming(0, {
          duration: BOB_DURATION[mood] / 2,
          easing: Easing.inOut(Easing.quad),
        }),
      ),
      -1,
      false,
    );
    antennaGlow.value = 0.2;
    antennaGlow.value = withRepeat(
      withSequence(
        withTiming(0.55, {duration: mood === 'thinking' ? 450 : 850}),
        withTiming(0.2, {duration: mood === 'thinking' ? 450 : 850}),
      ),
      -1,
      false,
    );
    coreGlow.value = 0.25;
    coreGlow.value = withRepeat(
      withSequence(
        withTiming(0.6, {duration: 1100}),
        withTiming(0.25, {duration: 1100}),
      ),
      -1,
      false,
    );
    badgeY.value = 0;
    if (badge !== 'none') {
      badgeY.value = withDelay(
        400,
        withRepeat(
          withSequence(
            withTiming(-4, {duration: 1300, easing: Easing.inOut(Easing.quad)}),
            withTiming(0, {duration: 1300, easing: Easing.inOut(Easing.quad)}),
          ),
          -1,
          false,
        ),
      );
    }
    return () => {
      cancelAnimation(bob);
      cancelAnimation(antennaGlow);
      cancelAnimation(coreGlow);
      cancelAnimation(badgeY);
    };
  }, [mood, badge, bob, antennaGlow, coreGlow, badgeY]);

  // ── pose per mood ────────────────────────────────────────────────
  useEffect(() => {
    cancelAnimation(armL);
    cancelAnimation(armR);
    switch (mood) {
      case 'wave':
        armL.value = withTiming(150, {duration: 500});
        armL.value = withDelay(
          500,
          withRepeat(
            withSequence(
              withTiming(120, {duration: 420}),
              withTiming(158, {duration: 420}),
            ),
            -1,
            true,
          ),
        );
        armR.value = withSpring(-6, {damping: 14});
        break;
      case 'thinking':
        armL.value = withSpring(18, {damping: 13}); // hand near chin
        armR.value = withSpring(-14, {damping: 13});
        break;
      case 'shield':
        armL.value = withSpring(32, {damping: 13});
        armR.value = withSpring(-32, {damping: 13});
        break;
      case 'point':
        armL.value = withSpring(10, {damping: 13});
        armR.value = withTiming(-142, {duration: 550}); // raised, presenting
        break;
      case 'celebrate':
        armL.value = withTiming(152, {duration: 450});
        armR.value = withTiming(-152, {duration: 450});
        break;
      default:
        armL.value = withRepeat(
          withSequence(
            withTiming(3, {duration: 1500, easing: Easing.inOut(Easing.quad)}),
            withTiming(-3, {duration: 1500, easing: Easing.inOut(Easing.quad)}),
          ),
          -1,
          true,
        );
        armR.value = withRepeat(
          withSequence(
            withTiming(-3, {duration: 1700, easing: Easing.inOut(Easing.quad)}),
            withTiming(3, {duration: 1700, easing: Easing.inOut(Easing.quad)}),
          ),
          -1,
          true,
        );
    }
    headTilt.value = withSpring(mood === 'thinking' ? -7 : 0, {damping: 14});
    return () => {
      cancelAnimation(armL);
      cancelAnimation(armR);
    };
  }, [mood, armL, armR, headTilt]);

  // ── blinking loop ────────────────────────────────────────────────
  useEffect(() => {
    let stopped = false;
    const scheduleBlink = () => {
      if (stopped) {
        return;
      }
      const delay = 2200 + Math.random() * 2800;
      timer = setTimeout(() => {
        blinkRy.value = withSequence(
          withTiming(0.6, {duration: 90}),
          withTiming(8, {duration: 110}),
        );
        // occasionally double-blink
        if (Math.random() < 0.3) {
          blinkRy.value = withDelay(
            260,
            withSequence(
              withTiming(0.6, {duration: 90}),
              withTiming(8, {duration: 110}),
            ),
          );
        }
        scheduleBlink();
      }, delay);
    };
    let timer: ReturnType<typeof setTimeout>;
    scheduleBlink();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [blinkRy]);

  useEffect(() => {
    return () => {
      if (happyTimer.current) {
        clearTimeout(happyTimer.current);
      }
    };
  }, []);

  // ── gestures ─────────────────────────────────────────────────────
  // Shared-value mutations happen on the JS thread; the worklets only
  // bridge events across (tap logic uses timers + Date.now, which are
  // JS-only APIs; pan math is inlined to stay worklet-pure).
  const goHappy = () => {
    if (happyTimer.current) {
      clearTimeout(happyTimer.current);
    }
    happy.value = withTiming(1, {duration: 140});
    happyTimer.current = setTimeout(() => {
      happy.value = withTiming(0, {duration: 260});
    }, 1500);
  };

  const handleTap = () => {
    const now = Date.now();
    const isCombo = now - lastTap.current < 900;
    lastTap.current = now;
    goHappy();
    if (isCombo) {
      // double quick tap → 360° spin easter egg
      lastTap.current = 0;
      spin.value = 0;
      spin.value = withTiming(360, {
        duration: 680,
        easing: Easing.out(Easing.cubic),
      });
    } else {
      // happy hop, then resume the ambient bob
      bob.value = 0;
      bob.value = withSequence(
        withSpring(-26, {damping: 9, stiffness: 220}),
        withSpring(0, {damping: 13, stiffness: 160}),
      );
      bob.value = withDelay(
        620,
        withRepeat(
          withSequence(
            withTiming(-7, {duration: BOB_DURATION[mood] / 2}),
            withTiming(0, {duration: BOB_DURATION[mood] / 2}),
          ),
          -1,
          false,
        ),
      );
    }
  };

  const tap = Gesture.Tap().onStart(() => {
    'worklet';
    runOnJS(handleTap)();
  });

  const pan = Gesture.Pan()
    .onUpdate(e => {
      'worklet';
      eyeX.value = withTiming(Math.min(5, Math.max(-5, e.translationX / 14)), {
        duration: 90,
      });
      eyeY.value = withTiming(
        Math.min(4, Math.max(-3.5, e.translationY / 16)),
        {
          duration: 90,
        },
      );
    })
    .onEnd(() => {
      'worklet';
      eyeX.value = withSpring(0, {damping: 16});
      eyeY.value = withSpring(0, {damping: 16});
    });

  const gesture = Gesture.Simultaneous(tap, pan);

  // ── animated props ───────────────────────────────────────────────
  const bodyProps = useAnimatedProps(() => ({
    transform: [
      {translateX: 100},
      {translateY: 108},
      {rotate: `${spin.value}deg`},
      {translateX: -100},
      {translateY: -108},
      {translateY: bob.value},
    ],
  }));

  const headProps = useAnimatedProps(() => ({
    transform: [
      {translateX: 100},
      {translateY: 73},
      {rotate: `${headTilt.value}deg`},
      {translateX: -100},
      {translateY: -73},
    ],
  }));

  const eyeGroupProps = useAnimatedProps(() => ({
    transform: [{translateX: eyeX.value}, {translateY: eyeY.value}],
  }));

  const eyeOpenProps = useAnimatedProps(() => ({
    ry: blinkRy.value,
    opacity: 1 - happy.value * 0.85,
  }));

  const eyeHappyProps = useAnimatedProps(() => ({
    opacity: happy.value,
  }));

  const eyeGlowProps = useAnimatedProps(() => ({
    opacity: 0.32 * (1 - happy.value) + 0.06,
  }));

  const armLProps = useAnimatedProps(() => ({
    transform: [
      {translateX: 58},
      {translateY: 130},
      {rotate: `${armL.value}deg`},
    ],
  }));

  const armRProps = useAnimatedProps(() => ({
    transform: [
      {translateX: 142},
      {translateY: 130},
      {rotate: `${armR.value}deg`},
    ],
  }));

  const antennaHaloProps = useAnimatedProps(() => ({
    opacity: antennaGlow.value,
  }));

  const coreRingProps = useAnimatedProps(() => ({
    opacity: coreGlow.value,
    transform: [
      {translateX: 100},
      {translateY: 147},
      {scale: 1 + coreGlow.value * 0.25},
      {translateX: -100},
      {translateY: -147},
    ],
  }));

  const badgeProps = useAnimatedProps(() => ({
    transform: [{translateY: badgeY.value}],
  }));

  const shadowProps = useAnimatedProps(() => ({
    opacity: 0.16 - bob.value * 0.008,
    rx: 46 + bob.value * -1.2,
  }));

  const gradientIds = useMemo(
    () => `robot-g-${Math.random().toString(36).slice(2, 8)}`,
    [],
  );

  return (
    <GestureDetector gesture={gesture}>
      <Svg width={size} height={height} viewBox="0 0 200 210">
        <Defs>
          <LinearGradient id={gradientIds} x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={BRAND_VIOLET} />
            <Stop offset="1" stopColor={BRAND_BLUE} />
          </LinearGradient>
        </Defs>

        {/* ground shadow */}
        <AnimatedEllipse
          cx={100}
          cy={200}
          rx={46}
          animatedProps={shadowProps}
          fill="#0B0714"
        />

        {/* whole robot: bob + jump + spin */}
        <AnimatedG animatedProps={bodyProps}>
          {/* feet */}
          <Rect
            x={66}
            y={180}
            width={28}
            height={13}
            rx={6.5}
            fill={SHELL_SHADE}
          />
          <Rect
            x={106}
            y={180}
            width={28}
            height={13}
            rx={6.5}
            fill={SHELL_SHADE}
          />

          {/* arms (behind body) */}
          <AnimatedG animatedProps={armLProps}>
            <Rect
              x={-7}
              y={-4}
              width={14}
              height={46}
              rx={7}
              fill={SHELL}
              stroke={SHELL_STROKE}
              strokeWidth={1.5}
            />
            <Circle cx={0} cy={44} r={7.5} fill={SHELL_SHADE} />
          </AnimatedG>
          <AnimatedG animatedProps={armRProps}>
            <Rect
              x={-7}
              y={-4}
              width={14}
              height={46}
              rx={7}
              fill={SHELL}
              stroke={SHELL_STROKE}
              strokeWidth={1.5}
            />
            <Circle cx={0} cy={44} r={7.5} fill={SHELL_SHADE} />
          </AnimatedG>

          {/* body */}
          <Rect
            x={58}
            y={120}
            width={84}
            height={62}
            rx={22}
            fill={SHELL}
            stroke={SHELL_STROKE}
            strokeWidth={1.5}
          />
          {/* chest core */}
          <AnimatedCircle
            cx={100}
            cy={147}
            r={13}
            animatedProps={coreRingProps}
            fill={EYE_GLOW}
          />
          <Circle cx={100} cy={147} r={9} fill={`url(#${gradientIds})`} />

          {/* head group (tilts when thinking) */}
          <AnimatedG animatedProps={headProps}>
            {/* antenna */}
            <Rect
              x={96.5}
              y={12}
              width={7}
              height={16}
              rx={3.5}
              fill={SHELL_SHADE}
            />
            <AnimatedCircle
              cx={100}
              cy={10}
              r={12}
              animatedProps={antennaHaloProps}
              fill={EYE_GLOW}
            />
            <Circle
              cx={100}
              cy={10}
              r={6.5}
              fill={EYE}
              stroke={SHELL_STROKE}
              strokeWidth={1}
            />

            {/* ears */}
            <Rect
              x={26}
              y={58}
              width={16}
              height={30}
              rx={8}
              fill={`url(#${gradientIds})`}
            />
            <Rect
              x={158}
              y={58}
              width={16}
              height={30}
              rx={8}
              fill={`url(#${gradientIds})`}
            />

            {/* head shell */}
            <Rect
              x={36}
              y={26}
              width={128}
              height={94}
              rx={30}
              fill={SHELL}
              stroke={SHELL_STROKE}
              strokeWidth={1.5}
            />
            <Rect x={43} y={33} width={114} height={80} rx={24} fill={VISOR} />
            <Rect
              x={50}
              y={40}
              width={100}
              height={66}
              rx={19}
              fill={VISOR_INNER}
              opacity={0.55}
            />

            {/* face group (tracks finger) */}
            <AnimatedG animatedProps={eyeGroupProps}>
              {/* open eyes */}
              <AnimatedCircle
                cx={79}
                cy={72}
                r={13}
                animatedProps={eyeGlowProps}
                fill={EYE_GLOW}
              />
              <AnimatedCircle
                cx={121}
                cy={72}
                r={13}
                animatedProps={eyeGlowProps}
                fill={EYE_GLOW}
              />
              <AnimatedEllipse
                cx={79}
                cy={72}
                rx={8}
                animatedProps={eyeOpenProps}
                fill={EYE}
              />
              <AnimatedEllipse
                cx={121}
                cy={72}
                rx={8}
                animatedProps={eyeOpenProps}
                fill={EYE}
              />
              {/* happy squint arcs */}
              <AnimatedG animatedProps={eyeHappyProps}>
                <Path
                  d="M70,74 Q79,64 88,74"
                  stroke={EYE}
                  strokeWidth={5}
                  strokeLinecap="round"
                  fill="none"
                />
                <Path
                  d="M112,74 Q121,64 130,74"
                  stroke={EYE}
                  strokeWidth={5}
                  strokeLinecap="round"
                  fill="none"
                />
              </AnimatedG>
              {/* smile */}
              <Path
                d="M91,90 Q100,97 109,90"
                stroke="#9FB6FF"
                strokeWidth={3.5}
                strokeLinecap="round"
                fill="none"
                opacity={0.9}
              />
            </AnimatedG>
          </AnimatedG>
        </AnimatedG>

        {/* floating badge (wifi-off / shield / spark) */}
        {badge !== 'none' ? (
          <AnimatedG animatedProps={badgeProps}>
            <Circle cx={164} cy={44} r={17} fill={BADGE_BG} opacity={0.95} />
            {badge === 'wifi-off' ? (
              <G transform={[{translateX: 152}, {translateY: 32}]}>
                <Path
                  d="M5,11.5 A9.5,9.5 0 0 1 19,11.5"
                  stroke={BRAND_BLUE}
                  strokeWidth={2.4}
                  strokeLinecap="round"
                  fill="none"
                />
                <Path
                  d="M8.6,15 A5,5 0 0 1 15.4,15"
                  stroke={BRAND_BLUE}
                  strokeWidth={2.4}
                  strokeLinecap="round"
                  fill="none"
                />
                <Circle cx={12} cy={18.6} r={1.9} fill={BRAND_BLUE} />
                <Path
                  d="M4,3.5 L20,20.5"
                  stroke={BRAND_VIOLET}
                  strokeWidth={2.6}
                  strokeLinecap="round"
                />
              </G>
            ) : null}
            {badge === 'shield' ? (
              <Path
                d="M164,32 L173.5,35.8 L173.5,43.4 C173.5,49.4 169.6,53.6 164,55.6 C158.4,53.6 154.5,49.4 154.5,43.4 L154.5,35.8 Z"
                fill={`url(#${gradientIds})`}
              />
            ) : null}
            {badge === 'spark' ? (
              <Path
                d="M164,32.5 L166.6,40.4 L174.5,43 L166.6,45.6 L164,53.5 L161.4,45.6 L153.5,43 L161.4,40.4 Z"
                fill={`url(#${gradientIds})`}
              />
            ) : null}
          </AnimatedG>
        ) : null}
      </Svg>
    </GestureDetector>
  );
};
