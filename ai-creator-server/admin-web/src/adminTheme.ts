const adminTheme = {
  token: {
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    fontSize: 14,
    colorPrimary: '#6366f1',
    colorInfo: '#6366f1',
    colorSuccess: '#10b981',
    colorWarning: '#f59e0b',
    colorError: '#ef4444',
    colorTextBase: '#1e1b4b',
    colorBgBase: '#ffffff',
    borderRadius: 10,
    borderRadiusLG: 14,
    borderRadiusSM: 8,
    wireframe: false,
    colorBgContainer: 'rgba(255,255,255,0.72)',
    colorBgElevated: 'rgba(255,255,255,0.85)',
    colorBorder: 'rgba(255,255,255,0.25)',
    colorBorderSecondary: 'rgba(255,255,255,0.15)',
    boxShadow: '0 4px 24px rgba(99,102,241,0.08)',
    boxShadowSecondary: '0 2px 12px rgba(99,102,241,0.05)',
    controlHeight: 36,
    lineHeight: 1.6,
  },
  components: {
    Menu: {
      itemBg: 'transparent',
      subMenuItemBg: 'transparent',
      itemColor: 'rgba(255,255,255,0.75)',
      itemHoverColor: '#ffffff',
      itemSelectedColor: '#ffffff',
      itemHoverBg: 'rgba(255,255,255,0.12)',
      itemSelectedBg: 'linear-gradient(135deg, rgba(99,102,241,0.3), rgba(139,92,246,0.3))',
      itemActiveBg: 'rgba(255,255,255,0.08)',
      itemBorderRadius: 10,
      collapsedWidth: 72,
    },
    Table: {
      headerBg: 'rgba(99,102,241,0.06)',
      headerColor: '#6366f1',
      headerSplitColor: 'transparent',
      rowHoverBg: 'rgba(99,102,241,0.04)',
      borderColor: 'rgba(99,102,241,0.08)',
    },
    Card: {
      paddingLG: 20,
    },
    Button: {
      primaryShadow: '0 4px 14px rgba(99,102,241,0.3)',
      defaultShadow: '0 2px 8px rgba(0,0,0,0.04)',
    },
    Tag: {
      defaultBg: 'rgba(99,102,241,0.08)',
      defaultColor: '#6366f1',
    },
    Modal: {
      contentBg: 'rgba(255,255,255,0.92)',
      headerBg: 'transparent',
      titleFontSize: 18,
      titleColor: '#1e1b4b',
    },
    Tabs: {
      inkBarColor: '#6366f1',
      itemActiveColor: '#6366f1',
      itemHoverColor: '#8b5cf6',
    },
    Input: {
      activeBorderColor: '#6366f1',
      hoverBorderColor: '#8b5cf6',
      activeShadow: '0 0 0 2px rgba(99,102,241,0.12)',
    },
    Select: {
      optionSelectedBg: 'rgba(99,102,241,0.08)',
    },
  },
};

export default adminTheme;
