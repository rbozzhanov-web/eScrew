import { forwardRef, useCallback, useImperativeHandle, useMemo, useRef, type ReactNode } from 'react';
import { Animated, Easing, PanResponder, Platform, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';
import { swipeAxis, type SwipeAxis } from '@/src/domain/gesture';
import { softHaptic } from './haptics';

type Props = {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  onSwipeDown?: () => void;
  threshold?: number;
  dominance?: number;
};

export type SwipeSurfaceHandle = {
  /** Plays the same page-turn animation a swipe gesture triggers, for a button-driven change. -1 = content exits left (advance), 1 = content exits right (go back). */
  play: (direction: -1 | 1, callback: () => void) => void;
};

const RETURN_SPRING = { stiffness: 255, damping: 29, mass: 0.92, useNativeDriver: true } as const;
const ENTRY_SPRING = { stiffness: 275, damping: 31, mass: 0.9, useNativeDriver: true } as const;
const PAGE_EASING = Easing.bezier(0.22, 0.78, 0, 1);
const WEB_COMPOSITE = Platform.OS === 'web'
  ? ({ willChange: 'transform', backfaceVisibility: 'hidden', transformStyle: 'preserve-3d' } as any)
  : undefined;

// WebKit re-samples everything behind a backdrop-filter element on every frame it moves, so
// blurring several glass cards while they're all being translated at once (a tab or month/flight
// page turn) is far more expensive than the same cards sitting still. Suspending the blur — via a
// body class the glass surfaces read as a CSS custom property — for just the duration of the
// transform sidesteps that without touching the spring/timing logic below.
const GLASS_SUSPEND_CLASS = 'escrew-suspend-glass';
const suspendGlass = () => { if (Platform.OS === 'web' && typeof document !== 'undefined') document.body.classList.add(GLASS_SUSPEND_CLASS); };
const resumeGlass = () => { if (Platform.OS === 'web' && typeof document !== 'undefined') document.body.classList.remove(GLASS_SUSPEND_CLASS); };

export const SwipeSurface = forwardRef<SwipeSurfaceHandle, Props>(function SwipeSurface({ children, style, onSwipeLeft, onSwipeRight, onSwipeDown, threshold = 52, dominance = 1.25 }, ref) {
  const translation = useRef(new Animated.ValueXY()).current;
  const activeAxis = useRef<SwipeAxis | undefined>(undefined);
  const size = useRef({ width: 360, height: 640 });
  // Block only while the old page is leaving. As soon as the callback swaps in the
  // next page, a fresh gesture may interrupt its entry spring immediately.
  const transitioning = useRef(false);

  const reset = useCallback(() => {
    translation.setValue({ x: 0, y: 0 });
    transitioning.current = false;
  }, [translation]);

  const settle = useCallback(() => {
    Animated.spring(translation, { toValue: { x: 0, y: 0 }, ...RETURN_SPRING, isInteraction: false }).start(() => {
      transitioning.current = false;
      resumeGlass();
    });
  }, [translation]);

  const completeHorizontal = useCallback((direction: -1 | 1, callback: () => void, velocity = 0) => {
    if (transitioning.current) return;
    transitioning.current = true;
    suspendGlass();
    const width = Math.max(260, size.current.width);
    const speed = Math.abs(velocity);

    Animated.timing(translation.x, {
      toValue: direction * (width + 8),
      duration: speed >= 1 ? 120 : speed >= 0.65 ? 140 : 164,
      easing: PAGE_EASING,
      useNativeDriver: true,
      isInteraction: false,
    }).start(({ finished }) => {
      if (!finished) { settle(); return; }

      callback();
      softHaptic();
      translation.setValue({ x: -direction * width, y: 0 });
      // The page is now swapped. Do not wait for its entry spring before accepting
      // the next swipe; a new PanResponder grant will stop this spring cleanly.
      transitioning.current = false;
      requestAnimationFrame(() => {
        Animated.spring(translation.x, {
          toValue: 0,
          ...ENTRY_SPRING,
          velocity: direction * Math.min(2, Math.max(0.45, speed)),
          isInteraction: false,
        }).start(({ finished: entryFinished }) => {
          if (entryFinished) translation.setValue({ x: 0, y: 0 });
          resumeGlass();
        });
      });
    });
  }, [settle, translation]);

  useImperativeHandle(ref, () => ({
    play: (direction, callback) => completeHorizontal(direction, callback),
  }), [completeHorizontal]);

  const completeDown = useCallback((callback: () => void) => {
    if (transitioning.current) return;
    transitioning.current = true;
    suspendGlass();
    const height = Math.max(360, size.current.height);
    Animated.timing(translation.y, {
      toValue: height + 56,
      duration: 210,
      easing: Easing.bezier(0.32, 0.72, 0, 1),
      useNativeDriver: true,
      isInteraction: false,
    }).start(({ finished }) => {
      if (finished) { softHaptic(); callback(); }
      reset();
      resumeGlass();
    });
  }, [reset, translation]);

  const responder = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_, gesture) => {
      if (transitioning.current) return false;
      const absX = Math.abs(gesture.dx);
      const absY = Math.abs(gesture.dy);
      if (absX < 10 && absY < 10) return false;
      activeAxis.current = swipeAxis(gesture.dx, gesture.dy, Boolean(onSwipeLeft || onSwipeRight), Boolean(onSwipeDown), dominance);
      return activeAxis.current !== undefined;
    },
    onPanResponderGrant: () => {
      suspendGlass();
      translation.stopAnimation();
      translation.setValue({ x: 0, y: 0 });
    },
    onPanResponderMove: (_, gesture) => {
      if (activeAxis.current === 'horizontal') {
        const unavailable = (gesture.dx < 0 && !onSwipeLeft) || (gesture.dx > 0 && !onSwipeRight);
        const resisted = unavailable ? gesture.dx * 0.16 : gesture.dx;
        translation.setValue({ x: resisted, y: 0 });
      } else if (activeAxis.current === 'down') {
        const raw = Math.max(0, gesture.dy);
        const y = raw <= 300 ? raw : 300 + (raw - 300) * 0.28;
        translation.setValue({ x: 0, y });
      }
    },
    onPanResponderRelease: (_, gesture) => {
      const absX = Math.abs(gesture.dx);
      const absY = Math.abs(gesture.dy);
      const horizontal = activeAxis.current === 'horizontal' && absX > absY * dominance;
      const vertical = activeAxis.current === 'down' && absY > absX * dominance;
      const fastHorizontal = absX >= 18 && Math.abs(gesture.vx) >= 0.5;
      const fastDown = gesture.dy >= 18 && gesture.vy >= 0.68;

      activeAxis.current = undefined;
      if (horizontal && (absX >= threshold || fastHorizontal)) {
        if (gesture.dx < 0 && onSwipeLeft) { completeHorizontal(-1, onSwipeLeft, gesture.vx); return; }
        if (gesture.dx > 0 && onSwipeRight) { completeHorizontal(1, onSwipeRight, gesture.vx); return; }
      }
      if (vertical && (gesture.dy >= threshold || fastDown) && onSwipeDown) {
        completeDown(onSwipeDown);
        return;
      }
      settle();
    },
    onPanResponderTerminate: () => {
      activeAxis.current = undefined;
      settle();
    },
    onPanResponderTerminationRequest: () => true,
  }), [completeDown, completeHorizontal, dominance, onSwipeDown, onSwipeLeft, onSwipeRight, settle, threshold, translation]);

  const onLayout = useCallback((event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    if (width > 0) size.current.width = width;
    if (height > 0) size.current.height = height;
  }, []);

  return <Animated.View
    onLayout={onLayout}
    style={[style, WEB_COMPOSITE, { transform: translation.getTranslateTransform() }]}
    {...responder.panHandlers}
  >
    {children}
  </Animated.View>;
});
