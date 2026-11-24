(function (blocks, element, editor, components, i18n) {
  blocks.registerBlockType('accesslobby/login', {
    edit: function (props) {
      return element.createElement('div', editor.useBlockProps(),
        element.createElement(components.SelectControl, {label: i18n.__('Journey', 'accesslobby-sso'), value: props.attributes.intent,
          options: [{label: i18n.__('Sign in', 'accesslobby-sso'), value: 'login'}, {label: i18n.__('Join', 'accesslobby-sso'), value: 'join'}],
          onChange: function (intent) { props.setAttributes({intent: intent}); }}),
        element.createElement('p', {}, i18n.__('Continue with AccessLobby', 'accesslobby-sso')));
    }, save: function () { return null; }
  });
})(window.wp.blocks, window.wp.element, window.wp.blockEditor, window.wp.components, window.wp.i18n);
