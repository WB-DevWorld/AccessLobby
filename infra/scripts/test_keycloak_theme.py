import json
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
THEME = ROOT / "infra/keycloak/themes/accesslobby/login"


class KeycloakThemeTests(unittest.TestCase):
    def test_realm_selects_accesslobby_theme(self) -> None:
        realm = json.loads((ROOT / "infra/keycloak/realm.template.json").read_text())
        self.assertEqual(realm["displayName"], "AccessLobby")
        self.assertEqual(realm["displayNameHtml"], "AccessLobby")
        self.assertEqual(realm["loginTheme"], "accesslobby")

    def test_theme_has_supported_parent_and_assets(self) -> None:
        properties = (THEME / "theme.properties").read_text()
        self.assertIn("parent=keycloak.v2", properties)
        self.assertIn("css/accesslobby.css", properties)
        self.assertTrue((THEME / "resources/img/accesslobby-mark.svg").is_file())
        self.assertTrue((THEME / "resources/img/favicon.svg").is_file())

    def test_user_facing_messages_do_not_expose_realm_name(self) -> None:
        messages = (THEME / "messages/messages_en.properties").read_text()
        for expected in (
            "loginAccountTitle=Sign in to AccessLobby",
            "registerTitle=Create your AccessLobby account",
            "logoutConfirmTitle=Sign out of AccessLobby",
            "doLogout=Sign out",
            "invalidParameterMessage=This sign-in request is not valid. Return to the app and try again.",
        ):
            self.assertIn(expected, messages)
        self.assertNotIn("ACCESSLOBBY-FIRST-PARTY", messages.upper())

    def test_css_has_mobile_focus_and_dark_mode_guards(self) -> None:
        css = (THEME / "resources/css/accesslobby.css").read_text()
        self.assertIn("@media (max-width: 480px)", css)
        self.assertIn(":focus-visible", css)
        self.assertIn("prefers-color-scheme: dark", css)
        self.assertIn("prefers-reduced-motion: reduce", css)

    def test_custom_iam_image_is_pinned_and_copies_theme(self) -> None:
        dockerfile = (ROOT / "infra/keycloak/Dockerfile").read_text()
        self.assertIn("quay.io/keycloak/keycloak:26.7.4", dockerfile)
        self.assertIn("COPY infra/keycloak/themes/accesslobby", dockerfile)

    def test_reconciliation_preserves_theme_selection(self) -> None:
        script = (ROOT / "infra/keycloak/reconcile-realm.sh").read_text()
        for token in ("IAM_LOGIN_THEME", "IAM_DISPLAY_NAME", "loginTheme", "displayName"):
            self.assertIn(token, script)


if __name__ == "__main__":
    unittest.main()
