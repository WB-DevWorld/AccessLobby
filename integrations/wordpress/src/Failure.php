<?php
namespace AccessLobby\WordPress;

/** Only non-sensitive, fixed failure classes cross the UI/audit boundary. */
final class Failure extends \RuntimeException {}
