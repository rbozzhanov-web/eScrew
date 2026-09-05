import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState, type ReactNode } from 'react';
import { Animated, PanResponder, StyleSheet, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';
import { softHaptic } from './haptics';

type Page = { key: string; content: ReactNode };
type Transition = { from: string; to: string; direction: -1 | 1 };

type Props = {
  activeTab: string;
  pages: Page[];
  /**
   * Continuous index position (0, 1, 2, ...), owned by the caller. Both the pages here and
   * anything else the caller derives from it (e.g. a tab-bar indicator) read off this same
   * value, so they can never drift out of sync the way two independent Animated.spring calls
   * driven by separate state updates could.
   */
  progress: Animated.Value;
  style?: StyleProp<ViewStyle>;
  onBeforeChange?: (target: string) => void;
  onChange: (target: string) => void;
};

export type TabPagerHandle = {
  goTo: (target: string) => void;
};

export const TAB_PAGER_SPRING = { stiffness: 300, damping: 32, mass: 0.9, useNativeDriver: true } as const;
const RETURN_SPRING = { stiffness: 255, damping: 29, mass: 0.92, useNativeDriver: true } as const;

/**
 * A two-pane pager: the outgoing and incoming tab move during the same spring, both positioned
 * as a function of the shared `progress` value. Unlike a single translated container, it never
 * leaves an empty frame between the two pages.
 */
export const TabPager = forwardRef<TabPagerHandle, Props>(function TabPager({ activeTab, pages, progress, style, onBeforeChange, onChange }, ref) {
  const indexOf = useCallback((key: string) => pages.findIndex((page) => page.key === key), [pages]);
  const width = useRef(360);
  const transitionRef = useRef<Transition | undefined>(undefined);
  const finishing = useRef(false);
  const settledIndex = useRef(indexOf(activeTab));
  const [transition, setTransition] = useState<Transition | undefined>(undefined);

  const clear = useCallback(() => {
    transitionRef.current = undefined;
    finishing.current = false;
    setTransition(undefined);
  }, []);

  const targetFor = useCallback((from: string, pageOffset: -1 | 1) => {
    const index = indexOf(from);
    return pages[index + pageOffset]?.key;
  }, [indexOf, pages]);

  const finish = useCallback((next: Transition, velocity = 0) => {
    if (finishing.current) return;
    finishing.current = true;
    const toIndex = indexOf(next.to);
    const carriedVelocity = next.direction * Math.min(2.4, Math.max(0.8, Math.abs(velocity)));
    // Commit before the spring starts, so anything driven by `progress` (the page here, a
    // tab-bar indicator in the caller) begins moving on the exact same frame.
    onChange(next.to);
    Animated.spring(progress, {
      toValue: toIndex,
      ...TAB_PAGER_SPRING,
      velocity: carriedVelocity / Math.max(1, width.current),
      isInteraction: false,
    }).start(({ finished }) => {
      if (!finished) { clear(); return; }
      softHaptic();
      settledIndex.current = toIndex;
      clear();
    });
  }, [clear, indexOf, onChange, progress]);

  const begin = useCallback((target: string, velocity = 0) => {
    if (finishing.current || transitionRef.current || target === activeTab) return;
    const fromIndex = indexOf(activeTab);
    const toIndex = indexOf(target);
    if (fromIndex < 0 || toIndex < 0) return;
    const next: Transition = { from: activeTab, to: target, direction: toIndex > fromIndex ? -1 : 1 };
    onBeforeChange?.(target);
    transitionRef.current = next;
    setTransition(next);
    requestAnimationFrame(() => finish(next, velocity));
  }, [activeTab, finish, indexOf, onBeforeChange]);

  useImperativeHandle(ref, () => ({ goTo: begin }), [begin]);

  // If `activeTab` changes through some path other than goTo()/a swipe (e.g. a direct setTab
  // elsewhere in the app), snap `progress` to match rather than leaving it stale — this only
  // ever fires outside a pager-driven transition, so it never fights an in-flight spring.
  useEffect(() => {
    if (transitionRef.current || finishing.current) return;
    const index = indexOf(activeTab);
    if (settledIndex.current === index) return;
    settledIndex.current = index;
    progress.setValue(index);
  }, [activeTab, indexOf, progress]);

  const responder = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_, gesture) => Math.abs(gesture.dx) > 8 && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.25,
    onPanResponderGrant: () => {
      if (finishing.current) return;
      progress.stopAnimation();
      transitionRef.current = undefined;
      setTransition(undefined);
    },
    onPanResponderMove: (_, gesture) => {
      if (finishing.current) return;
      // The visual direction follows the finger, while the page offset is its inverse:
      // swipe left reveals the next tab; swipe right reveals the previous tab.
      const direction: -1 | 1 = gesture.dx < 0 ? -1 : 1;
      const pageOffset: -1 | 1 = direction === -1 ? 1 : -1;
      let next = transitionRef.current;
      if (!next && Math.abs(gesture.dx) > 1) {
        const target = targetFor(activeTab, pageOffset);
        if (!target) return;
        next = { from: activeTab, to: target, direction };
        onBeforeChange?.(target);
        transitionRef.current = next;
        setTransition(next);
      }
      if (!next || next.direction !== direction) return;
      progress.setValue(indexOf(next.from) - gesture.dx / Math.max(1, width.current));
    },
    onPanResponderRelease: (_, gesture) => {
      const next = transitionRef.current;
      if (!next) return;
      const shouldFinish = Math.abs(gesture.dx) >= 52 || (Math.abs(gesture.dx) >= 18 && Math.abs(gesture.vx) >= 0.5);
      if (shouldFinish) { finish(next, gesture.vx); return; }
      Animated.spring(progress, { toValue: indexOf(next.from), ...RETURN_SPRING, isInteraction: false }).start(clear);
    },
    onPanResponderTerminate: () => {
      if (!transitionRef.current) return;
      Animated.spring(progress, { toValue: indexOf(transitionRef.current.from), ...RETURN_SPRING, isInteraction: false }).start(clear);
    },
    onPanResponderTerminationRequest: () => true,
  }), [activeTab, clear, finish, indexOf, onBeforeChange, progress, targetFor]);

  const onLayout = useCallback((event: LayoutChangeEvent) => {
    const next = event.nativeEvent.layout.width;
    if (next > 0) width.current = next;
  }, []);

  return <View onLayout={onLayout} style={[styles.viewport, style]} {...responder.panHandlers}>
    {pages.map((page, index) => {
      const moving = transition && (page.key === transition.from || page.key === transition.to);
      const visible = page.key === activeTab || moving;
      const translateX = Animated.multiply(Animated.subtract(index, progress), width.current);
      return <Animated.View key={page.key} pointerEvents={!transition && page.key === activeTab ? 'auto' : 'none'} style={[styles.pane, !visible && styles.hidden, { transform: [{ translateX }] }]}>
        {page.content}
      </Animated.View>;
    })}
  </View>;
});

const styles = StyleSheet.create({
  viewport: { flex: 1, minHeight: 0, overflow: 'hidden' },
  pane: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
  hidden: { opacity: 0 },
});
