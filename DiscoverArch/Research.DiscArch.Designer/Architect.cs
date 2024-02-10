using System.Text.RegularExpressions;
using Newtonsoft.Json;
using Research.DiscArch.Models;
using Research.DiscArch.Services;
using Research.DiscArch.TestData;

namespace Research.DiscArch.Designer;

public enum QualityWeightsMode
{
    EquallyImportant,
    AllRequired,
    Inferred
}

public class Architect
{
    private Matrix qualityArchPatternmatrix = new();
    private Dictionary<string, int> qualityWeights = new();
    private IReportingService reportingService;
    private ExperimentSettings experimentSettings;
    private List<Requirement> requirements;
    private Dictionary<string, List<Requirement>> conditionGroups = new();

    public Architect(IReportingService reportingService, ExperimentSettings experimentSettings, List<Requirement> requirements)
    {
        this.reportingService = reportingService;
        this.experimentSettings = experimentSettings;
        this.requirements = requirements;

        qualityArchPatternmatrix = ResourceManager.LoadArchPattenMatrix();

        if (experimentSettings.QualityWeightsMode == Enum.GetName(QualityWeightsMode.EquallyImportant))
        {
            foreach (var column in qualityArchPatternmatrix.GetRows().First().Value)
            {
                qualityWeights[column.Key] = 1;
            }
        }
        else if (experimentSettings.QualityWeightsMode == Enum.GetName(QualityWeightsMode.AllRequired))
        {

        }
        else if (experimentSettings.QualityWeightsMode == Enum.GetName(QualityWeightsMode.Inferred))
        {
            foreach (var requirement in requirements)
            {
                foreach (var quality in requirement.QualityAttributes)
                {
                    if (!qualityWeights.ContainsKey(quality))
                        qualityWeights[quality] = 0;
                    qualityWeights[quality]++;
                }
            }
        }

        //Make weights a percentage
        var totalWeight = qualityWeights.Sum(kv => kv.Value);
        foreach (var kv in qualityWeights)
        {
            qualityWeights[kv.Key] = kv.Value * 100 / totalWeight;
        }
    }

    public async Task<IEnumerable<Concern>> SelectArch()
    {
        await GenerateConditionGroups();

        Console.WriteLine("Analyzing conditions ...");

        var gptService = new GptService();
        var instructions = "Task: Organize a provided set of conditions into distinct, non-contradictory groups. Once grouped, simply return the IDs of the conditions in each group enclosed in parentheses. For instance, if there are two groups where the first group includes requirements 1 and 3, and the second group includes requirements 3, your response should be formatted as ((1,2),(3)).\n" +
            "1. It is possible that one condition is part of more than one group" +
            "2. If a condition is applicable 'under any circumstances' or alway true include it in all groups";

        reportingService.Writeline();
        reportingService.Writeline("Conditions:");
        var conditions = conditionGroups.Keys.ToList();
        reportingService.Writeline(JsonConvert.SerializeObject(conditions));

        var specificConditions = conditions.Where(c => c != "under any circumstances");

        List<List<int>> satifiabledGroups = new(); 
        if (specificConditions.Any())
        {
            var ask = $"Conditions: {JsonConvert.SerializeObject(conditions)}";

            var response = await gptService.Call(instructions, ask);
            satifiabledGroups = ParseConditionResponse(response);
            reportingService.Writeline();
            reportingService.Writeline("- Condition Groups:");
            reportingService.Writeline(response);
        }
        else
        {
            reportingService.Writeline("- No condition groups exist.");
        }

        var concerns = new List<Concern>();

        foreach (var ug in satifiabledGroups)
        {
            var qualityAttrbutes = ug.SelectMany(g => requirements[g].QualityAttributes).ToList();

            var concern = new Concern
            {
                Conditions = ug.Select(g => requirements[g].ConditionText).ToList(),
                DesiredQualities = qualityAttrbutes,
                Decisions = SelectDecisions(qualityAttrbutes).decision
            };
            concerns.Add(concern);
        }

        return concerns;
    }

    public (List<Decision> decision, Dictionary<string, int> satisfactionScores) SelectDecisions(List<string> desiredQualities, OptimizerMode optimizerMode = OptimizerMode.ILP)
    {
        Console.WriteLine("Finding optimal solution ...");

        Optimizer optimizer = new();
        var solution = optimizer.Optimize(optimizerMode, desiredQualities, qualityArchPatternmatrix, qualityWeights);

        reportingService.Writeline();
        reportingService.Writeline("Optimal Solution");
        if (solution.decision.Any())
        {
            reportingService.Writeline($"Optimal Solution Found! Overall Score (out of 100):{solution.satisfactionScores.Average(s => s.Value)}");
            foreach (var score in solution.satisfactionScores.Where(kv => kv.Value != 0))
            {
                reportingService.Writeline($"{score.Key}: {score.Value}, (weight: {qualityWeights[score.Key]})");
            }
        }
        else
        {
            reportingService.Writeline("No optimal Solution Found!");
        }    

        return solution;
    }

    private async Task GenerateConditionGroups()
    {
        var gptService = new GptService();
        var instructions = "If the following conditions are logically equivalnt return 'True' otherwise return 'False'. Just return True of False.";
        foreach (var req in requirements)
        {
            if (!conditionGroups.Any())
            {
                conditionGroups.Add(req.ConditionText, new());
                conditionGroups[req.ConditionText].Add(req);
            }

            else
            {
                foreach (var group in conditionGroups)
                {
                    var ask = $"Condition 1: '{req.ConditionText}'\n " +
                        $"Condition 2: '{group.Key}'";

                    var response = await gptService.Call(instructions, ask);

                    bool evaluivalent = response == "True";

                    if (evaluivalent)
                    {
                        group.Value.Add(req);
                    }
                    else
                    {
                        conditionGroups.Add(req.ConditionText, new());
                        conditionGroups[req.ConditionText].Add(req);
                    }
                }
            }
        }
    }

    private List<List<int>> ParseConditionResponse(string response)
    {
        var result = new List<List<int>>();

        // Remove the outermost parentheses and split the string
        response = response.Trim('(', ')');
        var groups = Regex.Split(response, @"\)\s*,\s*\(");

        foreach (var group in groups)
        {
            var ids = new List<int>();
            var idStrings = group.Split(',');

            foreach (var idString in idStrings)
            {
                if (int.TryParse(idString.Trim(), out int id))
                {
                    ids.Add(id);
                }
                else
                {
                    throw new FormatException("Invalid format for ID");
                }
            }

            result.Add(ids);
        }

        return result;
    }

}

