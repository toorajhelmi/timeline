using Apsy.Xi.Models;
using Apsy.Xi.Services;
using Microsoft.VisualBasic;

namespace Apsy.Xi
{
    public class Agent()
    {
        private GptService gptService;
        private RequirementProcessor requirementProcessor;
        private List<Requirement> requirements = new();
        private Dictionary<int, (string, List<Requirement>)> groups = new();
        public Agent(GptService gptService)
        {
            ths.gptService = gptService;
            requirementProcessor = new RequirementProcessor(gptService);
        }

        public void ProcessNewExpectation(string expectation)
        {
            var requirement = requirementProcessor.ProcessExpectation(expectation);
            requirements.Add(requirement);

            var groupId = AssignToGroup(requirement);
            if (groups[groupId].Item2.Count > 1)
            {
                var conflictingRequirements = FindConflictingRequirements(requirement);
            }
        }

        private int AssignToGroup(Requirement requirement)
        {
            var instructions = "Given the conditions included in the context, specify whether the new condition is equivalent to any or not.\n\n" +
            "Return value: If yes, return the group id, otherwise, return -1.\n" +

            var groupId = gptService.ProcessText<int>(instructions, requirement.Condition);
            if (groupId == -1)
            {
                var group = new RequirementGroup
                {
                    Id = groups.Count + 1,
                    Condition = requirement.Condition
                };
                groups.Add(groups.Count + 1, (requirement.condition, [requirement]));
                return group.Id;
            }
            else
            {
                groups[groupId].Item2.Add(requirement);
                return groupId;
            }
        }

        private object FindConflictingRequirements(object requirement)
        {
            
        }

    }
}