using System.Text;
using System.Text.Json;

namespace LocalGameGallery.IsolationHelper;

internal sealed class FirewallHelperRequest
{
    public string RequestId { get; set; } = string.Empty;
    public string Action { get; set; } = string.Empty;
    public string RuleGroup { get; set; } = string.Empty;
    public string? ExecutablePath { get; set; }
    public string? GameName { get; set; }
}

internal sealed class FirewallHelperResponse
{
    public bool Ok { get; set; }
    public string RequestId { get; set; } = string.Empty;
    public string? Message { get; set; }
    public string ProcessedAt { get; set; } = DateTime.UtcNow.ToString("O");
}

internal static class Program
{
    private const int NetFwActionBlock = 0;
    private const int NetFwRuleDirectionIn = 1;
    private const int NetFwRuleDirectionOut = 2;
    private const int NetFwProfileAll = unchecked((int)0x7FFFFFFF);

    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        WriteIndented = false,
    };

    private static readonly UTF8Encoding Utf8NoBom = new(false);
    private static readonly string HelperRoot = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
        "LocalGameGallery",
        "firewall-helper"
    );
    private static readonly string RequestsPath = Path.Combine(HelperRoot, "requests");
    private static readonly string ResponsesPath = Path.Combine(HelperRoot, "responses");

    [STAThread]
    private static int Main()
    {
        try
        {
            Directory.CreateDirectory(RequestsPath);
            Directory.CreateDirectory(ResponsesPath);

            var pendingRequestFiles = Directory
                .EnumerateFiles(RequestsPath, "*.json", SearchOption.TopDirectoryOnly)
                .OrderBy(path => path, StringComparer.OrdinalIgnoreCase)
                .ToArray();

            foreach (var requestFilePath in pendingRequestFiles)
            {
                ProcessRequestFile(requestFilePath);
            }

            return 0;
        }
        catch
        {
            return 1;
        }
    }

    private static void ProcessRequestFile(string requestFilePath)
    {
        var requestId = Path.GetFileNameWithoutExtension(requestFilePath);
        var responseFilePath = Path.Combine(ResponsesPath, $"{requestId}.json");

        try
        {
            var requestJson = File.ReadAllText(requestFilePath, Utf8NoBom);
            var request = JsonSerializer.Deserialize<FirewallHelperRequest>(requestJson, JsonOptions)
                ?? throw new InvalidOperationException("Request payload could not be parsed.");

            if (string.IsNullOrWhiteSpace(request.RequestId))
            {
                request.RequestId = requestId;
            }

            ExecuteRequest(request);
            WriteResponse(responseFilePath, new FirewallHelperResponse
            {
                Ok = true,
                RequestId = request.RequestId,
            });
        }
        catch (Exception error)
        {
            WriteResponse(responseFilePath, new FirewallHelperResponse
            {
                Ok = false,
                RequestId = requestId,
                Message = error.Message,
            });
        }
        finally
        {
            try
            {
                File.Delete(requestFilePath);
            }
            catch
            {
                // Best-effort cleanup only.
            }
        }
    }

    private static void ExecuteRequest(FirewallHelperRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.RuleGroup))
        {
            throw new InvalidOperationException("Rule group is required.");
        }

        switch (request.Action.Trim().ToLowerInvariant())
        {
            case "create":
                if (string.IsNullOrWhiteSpace(request.ExecutablePath))
                {
                    throw new InvalidOperationException("Executable path is required for create requests.");
                }

                CreateRules(request.RuleGroup, request.ExecutablePath, request.GameName);
                break;
            case "remove":
                RemoveRules(request.RuleGroup);
                break;
            default:
                throw new InvalidOperationException($"Unsupported helper action: {request.Action}");
        }
    }

    private static void CreateRules(string ruleGroup, string executablePath, string? gameName)
    {
        RemoveRules(ruleGroup);

        var policy = CreatePolicy();
        AddRule(policy, ruleGroup, executablePath, gameName, NetFwRuleDirectionOut, "Outbound");
        AddRule(policy, ruleGroup, executablePath, gameName, NetFwRuleDirectionIn, "Inbound");
    }

    private static void RemoveRules(string ruleGroup)
    {
        var policy = CreatePolicy();
        var rules = policy.Rules;
        var namesToRemove = new List<string>();

        foreach (var existingRule in rules)
        {
            if (!string.Equals(existingRule.Grouping as string, ruleGroup, StringComparison.Ordinal))
            {
                continue;
            }

            var ruleName = existingRule.Name as string;
            if (!string.IsNullOrWhiteSpace(ruleName))
            {
                namesToRemove.Add(ruleName);
            }
        }

        foreach (var ruleName in namesToRemove)
        {
            rules.Remove(ruleName);
        }
    }

    private static dynamic CreatePolicy()
    {
        var policyType = Type.GetTypeFromProgID("HNetCfg.FwPolicy2")
            ?? throw new InvalidOperationException("Windows Firewall policy COM type is unavailable.");
        return Activator.CreateInstance(policyType)
            ?? throw new InvalidOperationException("Windows Firewall policy could not be instantiated.");
    }

    private static void AddRule(dynamic policy, string ruleGroup, string executablePath, string? gameName, int direction, string directionLabel)
    {
        var ruleType = Type.GetTypeFromProgID("HNetCfg.FWRule")
            ?? throw new InvalidOperationException("Windows Firewall rule COM type is unavailable.");
        dynamic rule = Activator.CreateInstance(ruleType)
            ?? throw new InvalidOperationException("Windows Firewall rule could not be instantiated.");

        var normalizedGameName = string.IsNullOrWhiteSpace(gameName) ? Path.GetFileNameWithoutExtension(executablePath) : gameName.Trim();

        rule.Name = $"Local Game Gallery {directionLabel} Block: {normalizedGameName} [{ruleGroup}]";
        rule.Description = $"Managed by Local Game Gallery isolation helper for {normalizedGameName}.";
        rule.ApplicationName = executablePath;
        rule.Action = NetFwActionBlock;
        rule.Direction = direction;
        rule.Enabled = true;
        rule.Grouping = ruleGroup;
        rule.Profiles = NetFwProfileAll;

        policy.Rules.Add(rule);
    }

    private static void WriteResponse(string responseFilePath, FirewallHelperResponse response)
    {
        response.ProcessedAt = DateTime.UtcNow.ToString("O");
        var responseJson = JsonSerializer.Serialize(response, JsonOptions);
        File.WriteAllText(responseFilePath, responseJson, Utf8NoBom);
    }
}
