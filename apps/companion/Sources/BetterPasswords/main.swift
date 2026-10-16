// One executable, two roles. Opened by the user, it is the setup window. Started by launchd with
// --agent (see Resources/io.github.fanckush.betterpasswords.agent.plist), it is the headless agent. Both roles
// share one code signature, so the Accessibility permission granted in setup is the agent's too.

if CommandLine.arguments.contains("--agent") {
    Agent.run()
} else {
    CompanionApp.main()
}
