declare module '*.png' {
  const value: any;
  export default value;
}

declare module '*.svg' {
  import React from 'react';
  import {SvgProps} from 'react-native-svg';
  const content: React.FC<SvgProps>;
  export default content;
}

// react-native-vector-icons ships no TypeScript declarations for its
// per-font entry points (see audit finding F-09). Only these two fonts
// are imported anywhere in the app; extend this file when more are added.
declare module 'react-native-vector-icons/MaterialCommunityIcons' {
  import type {ComponentType, StyleProp, TextStyle} from 'react';
  type VectorIconProps = {
    name: string;
    size?: number;
    color?: string;
    style?: StyleProp<TextStyle>;
    testID?: string;
    allowFontScaling?: boolean;
  };
  const Icon: ComponentType<VectorIconProps>;
  export default Icon;
}

declare module 'react-native-vector-icons/MaterialIcons' {
  import type {ComponentType, StyleProp, TextStyle} from 'react';
  type VectorIconProps = {
    name: string;
    size?: number;
    color?: string;
    style?: StyleProp<TextStyle>;
    testID?: string;
    allowFontScaling?: boolean;
  };
  const Icon: ComponentType<VectorIconProps>;
  export default Icon;
}

// The clipboard package publishes a JS-only jest mock with no declarations.
declare module '@react-native-clipboard/clipboard/jest/clipboard-mock.js' {
  const mockClipboard: {
    getString: () => Promise<string>;
    setString: (content: string) => Promise<string>;
    hasString: () => Promise<boolean>;
    clear: () => Promise<void>;
  };
  export default mockClipboard;
}
