namespace Apsy.Xi.Basic
{
    public class Graph
    {
        public List<Node> Nodes { get; } = new();

        public Node AddNode(Node node)
        {
            Nodes.Add(node);
            return node;
        }

        public void AddEdge(Node node1, Node node2)
        {
            node1.Neighbors.Add(node2);
            node2.Neighbors.Add(node1);
        }
    }
}

