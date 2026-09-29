import React, { useRef } from 'react';
import {
  Image,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';

const WOMEN_BG = require('../../assets/images/women-bg.png');

interface ScreenBackgroundProps {
  opacity?: number;
  mobileOpacity?: number;
  desktopWidth?: string | number;
}

export default function ScreenBackground({
  opacity = 0.18,
  mobileOpacity = 0.10,
  desktopWidth = '55%',
}: ScreenBackgroundProps) {
  const { width, height } = useWindowDimensions();

  // Keep the original screen size fixed so opening the keyboard
  // does not resize or move the background image.
  const initialSize = useRef({ width, height }).current;

  const isMobile = initialSize.width < 768;

  if (isMobile) {
    // Mobile:
    // Same women-bg.png
    // Full body visible
    // Feet stay at the bottom
    // Head is positioned slightly lower
    // Image does not shrink when keyboard opens
    const imageHeight = initialSize.height * 0.92;
    const imageWidth = imageHeight * (1024 / 1536);

    return (
      <View style={styles.mobileLayer}>
        <Image
          source={WOMEN_BG}
          resizeMode="contain"
          style={[
            styles.mobileImage,
            {
              width: imageWidth,
              height: imageHeight,
              opacity: mobileOpacity,
              left: (initialSize.width - imageWidth) / 2,
            },
          ]}
        />
      </View>
    );
  }

  // Desktop/Web:
  // Keep the original right-side background behavior.
  return (
    <View style={styles.desktopLayer}>
      <Image
        source={WOMEN_BG}
        resizeMode="contain"
        style={[
          styles.desktopImage,
          {
            width: desktopWidth as any,
            height: '100%',
            opacity,
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  mobileLayer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    overflow: 'hidden',
    zIndex: 0,
    pointerEvents: 'none',
  },

  mobileImage: {
    position: 'absolute',
    bottom: 0,
  },

  desktopLayer: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    width: '100%',
    overflow: 'hidden',
    zIndex: 0,
    pointerEvents: 'none',
  },

  desktopImage: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
  },
});