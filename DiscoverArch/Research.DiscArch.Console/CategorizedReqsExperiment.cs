using Research.DiscArch.Designer;
using Research.DiscArch.Models;
using Research.DiscArch.Services;
using Research.DiscArch.TestData;

namespace Research.DiscArch.Console;

public class CategorizedReqsExperiment
{
    public async void Run(SystemNames system)
    {
        var experimentSettings = new ExperimentSettings
        {
            SystemName = Enum.GetName(system),
            OptimizationStrategy = Enum.GetName(OptimizerMode.ILP),
            QualityWeightsMode = Enum.GetName(QualityWeightsMode.Inferred)
        };

        var reportingService = new FileReportingService();
        reportingService.Writeline($"Date/Time: {DateTime.Now}");
        var reqs = ResourceManager.LoadRequirments(system);

        reportingService.Writeline();   
        reportingService.Writeline($"Settings:\n" +
            $"System Name: {experimentSettings.SystemName}\n" +
            $"Optimization Strategy: {experimentSettings.OptimizationStrategy}\n" +
            $"Quality Weights Mode: {experimentSettings.QualityWeightsMode}");

        reportingService.Writeline();
        reportingService.Writeline("Requirements");
        reportingService.Writeline(reqs);

        ReqParsing.RequirementParser parser = new(reportingService);
        parser.LoadFromText(reqs);

        await parser.Parse();

        var asr = parser.Requirements.Where(r => r.Parsed && r.IsArchitecturallySignificant).ToList();

        reportingService.Writeline();
        reportingService.Writeline("ASRs:");

        foreach (var requirement in asr)
        {
            reportingService.Writeline(requirement.Description);

            reportingService.Writeline($"- Quality: {string.Join(",", requirement.QualityAttributes)}");
            if (requirement.ConditionText != null)
            {
                reportingService.Writeline($"- Condition: {requirement.ConditionText}");
            }
            if (requirement.MetricTriggers.Any())
            {
                reportingService.Writeline($"- Metrics: {string.Join('\n', requirement.MetricTriggers.Select(m => m.ToString()))}");
            }
        }

        var concerns = (await new Architect(reportingService, experimentSettings, asr).SelectArch()).ToList();

        reportingService.Writeline();
        reportingService.Writeline("Concerns");

        foreach (var concern in concerns)
        {
            reportingService.Writeline($"Concern {concerns.IndexOf(concern)}\n");
            reportingService.Writeline(concern.ToString());
            reportingService.Writeline();
        }

        System.Console.WriteLine("Done!");
        System.Console.ReadLine();
    }
}
